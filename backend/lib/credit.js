/**
 * Credit Engine
 *
 * All credit operations go through this module.
 * Never update outstandingBalance directly — always post to ledger.
 * Balance is derived from ledger sum — always accurate, always auditable.
 *
 * Usage:
 *   const credit = require('./credit');
 *   await credit.postDebit(tx, { businessId, customerId, amount, saleId, description });
 *   await credit.postRepayment(tx, { businessId, customerId, amount, method, reference });
 *   const statement = await credit.getStatement(customerId, businessId);
 */

const prisma = require('./prisma');
const crypto = require('crypto');
const accounting = require('./accounting');

/**
 * Get the current balance from the ledger (source of truth).
 * Faster path: use customer.outstandingBalance for display,
 * but always derive from ledger for financial operations.
 */
async function getLedgerBalance(customerId, businessId, tx = prisma) {
  const result = await tx.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount ELSE 0 END), 0) AS total_debits,
      COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) AS total_credits
    FROM credit_ledger
    WHERE customer_id = ${customerId}::uuid
      AND business_id = ${businessId}::uuid
  `;
  const debits  = parseFloat(result[0]?.total_debits  || 0);
  const credits = parseFloat(result[0]?.total_credits || 0);
  return parseFloat((debits - credits).toFixed(2));
}

/**
 * Post a debit entry — customer owes more.
 * Called when a credit sale is made.
 */
async function postDebit(tx, { businessId, customerId, amount, currency = 'USD', saleId, description, recordedById, allowOverLimit = false }) {
  // Lock the customer row for the duration of the transaction. This both
  // exposes the credit limit and serializes concurrent credit sales so two
  // debits can't each read a stale balance and overshoot the limit together.
  const custRows = await tx.$queryRaw`
    SELECT credit_limit FROM customers
    WHERE id = ${customerId}::uuid AND business_id = ${businessId}::uuid
    FOR UPDATE
  `;
  if (!custRows.length) {
    throw Object.assign(new Error('Customer not found.'), { statusCode: 404 });
  }
  const creditLimit = parseFloat(custRows[0].credit_limit || 0);

  const balance = await getLedgerBalance(customerId, businessId, tx);
  const balanceAfter = parseFloat((balance + parseFloat(amount)).toFixed(2));

  // Enforce the credit limit (0 / null means "no limit set"). This was
  // previously unenforced — the provider check was passed `undefined`.
  if (!allowOverLimit && creditLimit > 0 && balanceAfter > creditLimit) {
    throw Object.assign(
      new Error(`Credit limit exceeded. Limit: ${creditLimit.toFixed(2)}, Current: ${balance.toFixed(2)}, Requested: ${parseFloat(amount).toFixed(2)}`),
      { statusCode: 400, code: 'CREDIT_LIMIT_EXCEEDED' }
    );
  }

  await tx.creditLedger.create({
    data: {
      businessId,
      customerId,
      type:         'purchase',
      amount:       parseFloat(amount),
      direction:    'debit',
      balanceAfter,
      currency,
      saleId:       saleId    || null,
      description:  description || 'Credit sale',
      recordedById: recordedById || null,
    },
  });

  // Keep denormalised balance in sync
  await tx.customer.update({
    where: { id: customerId },
    data:  { outstandingBalance: balanceAfter },
  });

  return balanceAfter;
}

/**
 * Post a credit entry — customer owes less (repayment).
 */
async function postRepayment(tx, { businessId, customerId, amount, currency = 'USD', paymentMethod, reference, planItemId, diasporaPayId, description, recordedById }) {
  // Lock the customer row so concurrent repayments serialize and can't both
  // pass the balance check (callers must pass a transaction-scoped `tx`).
  await tx.$queryRaw`
    SELECT 1 FROM customers
    WHERE id = ${customerId}::uuid AND business_id = ${businessId}::uuid
    FOR UPDATE
  `;
  const balance = await getLedgerBalance(customerId, businessId, tx);

  if (parseFloat(amount) > balance) {
    throw Object.assign(
      new Error(`Payment of ${amount} exceeds outstanding balance of ${balance}.`),
      { statusCode: 400, code: 'EXCEEDS_BALANCE' }
    );
  }

  const balanceAfter = parseFloat((balance - parseFloat(amount)).toFixed(2));
  const type = diasporaPayId ? 'diaspora_payment'
             : planItemId    ? 'installment_payment'
             : 'repayment';

  await tx.creditLedger.create({
    data: {
      businessId,
      customerId,
      type,
      amount:       parseFloat(amount),
      direction:    'credit',
      balanceAfter,
      currency,
      paymentMethod: paymentMethod || null,
      reference:     reference     || null,
      planItemId:    planItemId    || null,
      diasporaPayId: diasporaPayId || null,
      description:   description   || 'Credit repayment',
      recordedById:  recordedById  || null,
    },
  });

  await tx.customer.update({
    where: { id: customerId },
    data:  { outstandingBalance: balanceAfter },
  });

  // GL: a repayment brings in cash and reduces accounts receivable. (The credit
  // SALE already debited AR via the sale journal.)
  await accounting.postJournal(tx, {
    businessId,
    description: 'Credit repayment',
    sourceType: 'credit_repayment', sourceId: customerId, createdById: recordedById,
    lines: [
      { code: accounting.tenderAccountCode(paymentMethod), debit: parseFloat(amount), credit: 0, description: 'Repayment received' },
      { code: '1100', debit: 0, credit: parseFloat(amount), description: 'Accounts receivable' },
    ],
  });

  return balanceAfter;
}

/**
 * Get full statement for a customer — every ledger entry.
 * This replaces the branch visit for statement retrieval.
 */
async function getStatement(customerId, businessId, { from, to, limit = 100 } = {}) {
  const fromDate = from ? new Date(from) : null;
  const toDate   = to   ? new Date(to)   : null;

  const entries = await prisma.creditLedger.findMany({
    where: {
      customerId,
      businessId,
      ...(fromDate && { createdAt: { gte: fromDate } }),
      ...(toDate   && { createdAt: { lte: toDate   } }),
    },
    include: {
      sale: { select: { saleNumber: true, createdAt: true } },
      planItem: { select: { installmentNo: true, plan: { select: { planNumber: true, description: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, phone: true, creditLimit: true, outstandingBalance: true, currency: true },
  });

  return {
    customer,
    entries: entries.map(e => ({
      date:          e.createdAt,
      type:          e.type,
      direction:     e.direction,
      amount:        parseFloat(e.amount),
      balance_after: parseFloat(e.balanceAfter),
      currency:      e.currency,
      description:   e.description,
      reference:     e.reference,
      payment_method: e.paymentMethod,
      sale_number:   e.sale?.saleNumber || null,
      plan_number:   e.planItem?.plan?.planNumber || null,
      installment:   e.planItem?.installmentNo || null,
    })),
    summary: {
      current_balance: parseFloat(customer?.outstandingBalance || 0),
      credit_limit:    parseFloat(customer?.creditLimit || 0),
      available_credit: parseFloat(customer?.creditLimit || 0) - parseFloat(customer?.outstandingBalance || 0),
      total_entries:   entries.length,
    },
  };
}

/**
 * Generate a WhatsApp statement message for a customer.
 * Merchant sends this to the customer to show them their account.
 */
function formatWhatsAppStatement(statement, businessName, currency = 'USD') {
  const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
  const { customer, entries, summary } = statement;

  let msg = `📋 *Account Statement*\n`;
  msg += `🏪 ${businessName}\n`;
  msg += `👤 ${customer.name}\n`;
  msg += `─────────────────────\n`;

  // Last 10 entries
  const recent = entries.slice(0, 10);
  for (const e of recent) {
    const date = new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const sign = e.direction === 'debit' ? '+' : '-';
    const desc = e.sale_number ? `Sale ${e.sale_number}` : e.plan_number ? `Plan ${e.plan_number} #${e.installment}` : e.description || e.type;
    msg += `${date}  ${sign}${fmt(e.amount)}  ${desc}\n`;
  }

  msg += `─────────────────────\n`;
  msg += `💰 *Balance owed: ${fmt(summary.current_balance)}*\n`;
  if (summary.credit_limit > 0) {
    msg += `📊 Credit limit: ${fmt(summary.credit_limit)}\n`;
    msg += `✅ Available: ${fmt(summary.available_credit)}\n`;
  }

  return msg;
}

/**
 * Generate a secure payment token for a plan installment.
 * Used in diaspora payment links.
 */
function generatePaymentToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  getLedgerBalance,
  postDebit,
  postRepayment,
  getStatement,
  formatWhatsAppStatement,
  generatePaymentToken,
};
