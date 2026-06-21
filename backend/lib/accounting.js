/**
 * General Ledger — the accounting spine.
 *
 * Every vertical posts its money here as BALANCED double-entry journals, so a
 * business has one true set of books (across all its locations/verticals) and a
 * clean cashflow dataset for credit underwriting.
 *
 * Usage (inside a transaction):
 *   const gl = require('./accounting');
 *   await gl.postSale(tx, { businessId, sale, tenders, taxAmount, cogs, createdById });
 *
 * Posting is balanced by construction; postJournal asserts debits === credits.
 */

const prisma = require('./prisma');

// Standard small-business chart of accounts. System accounts are seeded per
// business on first posting (lazily) so every existing/new business is covered.
const CHART = [
  { code: '1000', name: 'Cash',                type: 'asset',     normal: 'debit'  },
  { code: '1010', name: 'Mobile Money',        type: 'asset',     normal: 'debit'  },
  { code: '1020', name: 'Bank / Card',         type: 'asset',     normal: 'debit'  },
  { code: '1100', name: 'Accounts Receivable', type: 'asset',     normal: 'debit'  },
  { code: '1110', name: 'Employee Advances',   type: 'asset',     normal: 'debit'  },
  { code: '1200', name: 'Inventory',           type: 'asset',     normal: 'debit'  },
  { code: '2000', name: 'Accounts Payable',    type: 'liability', normal: 'credit' },
  { code: '2100', name: 'Tax Payable',         type: 'liability', normal: 'credit' },
  { code: '2200', name: 'Financing Payable',   type: 'liability', normal: 'credit' },
  { code: '3000', name: "Owner's Equity",      type: 'equity',    normal: 'credit' },
  { code: '4000', name: 'Sales Revenue',       type: 'revenue',   normal: 'credit' },
  { code: '5000', name: 'Cost of Goods Sold',  type: 'expense',   normal: 'debit'  },
  { code: '5100', name: 'Salaries & Wages',     type: 'expense',   normal: 'debit'  },
  { code: '5200', name: 'Operating Expenses',   type: 'expense',   normal: 'debit'  },
  { code: '5300', name: 'Financing Cost',       type: 'expense',   normal: 'debit'  },
];

// Map a payment method to the asset/AR account its money lands in.
function tenderAccountCode(method) {
  switch ((method || 'cash').toLowerCase()) {
    case 'cash':                                   return '1000';
    case 'zaad': case 'evc': case 'mpesa':
    case 'telebirr': case 'mobile_money':          return '1010';
    case 'card': case 'stripe': case 'visa':
    case 'mastercard': case 'moov': case 'bank':   return '1020';
    case 'credit':                                 return '1100'; // billed to customer account
    default:                                       return '1000';
  }
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function ensureChart(tx, businessId) {
  // Idempotent: seeds the chart on first posting AND backfills any system
  // accounts added in later releases (e.g. Employee Advances) for businesses
  // whose chart predates them. Relies on the @@unique([businessId, code]).
  await tx.account.createMany({
    data: CHART.map(a => ({ businessId, code: a.code, name: a.name, type: a.type, normalBalance: a.normal, isSystem: true })),
    skipDuplicates: true,
  });
}

/**
 * Post a balanced journal entry. `lines` is [{ code, debit, credit, description }].
 * Throws if debits !== credits. Returns the created entry (or null if empty).
 */
async function postJournal(tx, { businessId, date = new Date(), description, sourceType, sourceId, createdById, lines }) {
  await ensureChart(tx, businessId);

  const clean = lines
    .map(l => ({ code: l.code, debit: round2(l.debit || 0), credit: round2(l.credit || 0), description: l.description }))
    .filter(l => l.debit !== 0 || l.credit !== 0);
  if (!clean.length) return null;

  const totalDebit  = round2(clean.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw Object.assign(
      new Error(`Unbalanced journal: debits ${totalDebit} != credits ${totalCredit}`),
      { statusCode: 500, code: 'GL_UNBALANCED' }
    );
  }

  const codes = [...new Set(clean.map(l => l.code))];
  const accounts = await tx.account.findMany({ where: { businessId, code: { in: codes } }, select: { id: true, code: true } });
  const byCode = Object.fromEntries(accounts.map(a => [a.code, a.id]));

  return tx.journalEntry.create({
    data: {
      businessId,
      entryNumber: `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date,
      description: description || null,
      sourceType: sourceType || null,
      sourceId: sourceId || null,
      createdById: createdById || null,
      lines: { create: clean.map(l => ({ accountId: byCode[l.code], debit: l.debit, credit: l.credit, description: l.description || null })) },
    },
  });
}

/**
 * Post the journal for a completed sale.
 *   Dr cash/mobile-money/bank/AR (per tender)   = total
 *   Cr Sales Revenue                             = total - tax
 *   Cr Tax Payable                               = tax
 *   Dr Cost of Goods Sold                        = cogs
 *   Cr Inventory                                 = cogs
 */
async function postSale(tx, { businessId, sale, tenders, taxAmount = 0, cogs = 0, createdById }) {
  const total = round2(sale.totalAmount);
  const tax   = round2(taxAmount);
  const cost  = round2(cogs);
  const lines = [];

  // Money received (or receivable), routed by tender to the right asset/AR account.
  for (const t of (tenders || [])) {
    lines.push({ code: tenderAccountCode(t.method), debit: round2(t.amount), credit: 0, description: `Tender: ${t.method}` });
  }
  // Revenue net of tax, and the tax liability.
  lines.push({ code: '4000', debit: 0, credit: round2(total - tax), description: 'Sales revenue' });
  if (tax > 0) lines.push({ code: '2100', debit: 0, credit: tax, description: 'Sales tax' });
  // Cost of goods sold + inventory relief.
  if (cost > 0) {
    lines.push({ code: '5000', debit: cost, credit: 0, description: 'COGS' });
    lines.push({ code: '1200', debit: 0, credit: cost, description: 'Inventory relief' });
  }

  return postJournal(tx, {
    businessId, description: `Sale ${sale.saleNumber || ''}`.trim(),
    sourceType: 'sale', sourceId: sale.id, createdById, lines,
  });
}

/**
 * A folio charge raises what the guest owes (AR) against revenue — or the tax
 * liability for a tax line. `type` is the FolioChargeType.
 */
async function postFolioCharge(tx, { businessId, type, amount, description, sourceId, createdById }) {
  const amt = round2(amount);
  if (amt <= 0) return null;
  const creditCode = type === 'tax' ? '2100' : '4000';
  return postJournal(tx, {
    businessId, description: description || 'Folio charge',
    sourceType: 'folio_charge', sourceId, createdById,
    lines: [
      { code: '1100', debit: amt, credit: 0, description: 'Guest folio (AR)' },
      { code: creditCode, debit: 0, credit: amt, description: description || (type === 'tax' ? 'Tax' : 'Folio revenue') },
    ],
  });
}

/** A folio payment brings in cash and reduces the guest's receivable. */
async function postFolioPayment(tx, { businessId, method, amount, sourceId, createdById }) {
  const amt = round2(amount);
  if (amt <= 0) return null;
  return postJournal(tx, {
    businessId, description: 'Folio payment',
    sourceType: 'folio_payment', sourceId, createdById,
    lines: [
      { code: tenderAccountCode(method), debit: amt, credit: 0, description: 'Payment received' },
      { code: '1100', debit: 0, credit: amt, description: 'Guest folio (AR)' },
    ],
  });
}

/**
 * A salary advance is a loan to the employee: an asset (we expect it back), not
 * an expense. Cash goes out, an Employee Advances receivable goes up. It is
 * cleared later out of payroll (see postPayroll's advanceRecovered).
 */
async function postAdvance(tx, { businessId, amount, method = 'cash', sourceId, createdById }) {
  const amt = round2(amount);
  if (amt <= 0) return null;
  return postJournal(tx, {
    businessId, description: 'Salary advance', sourceType: 'hr_advance', sourceId, createdById,
    lines: [
      { code: '1110', debit: amt, credit: 0, description: 'Employee advance (receivable)' },
      { code: tenderAccountCode(method), debit: 0, credit: amt, description: 'Advance paid out' },
    ],
  });
}

/**
 * Payroll: gross wages are an expense; net is paid in cash and the balance is
 * withheld as a payable. The deduction splits two ways — the part that recovers
 * an outstanding advance CLEARS the Employee Advances receivable (it is not a
 * new liability), and only the remainder is a genuine withholding payable.
 *   gross = net + deduction;  deduction = advanceRecovered + withholding.
 */
async function postPayroll(tx, { businessId, gross, net, deduction, advanceRecovered = 0, sourceId, createdById }) {
  const recovered   = round2(advanceRecovered);
  const withholding = round2(round2(deduction) - recovered);
  return postJournal(tx, {
    businessId, description: 'Payroll', sourceType: 'payroll', sourceId, createdById,
    lines: [
      { code: '5100', debit: round2(gross), credit: 0, description: 'Salaries & wages' },
      { code: '1000', debit: 0, credit: round2(net), description: 'Net pay' },
      { code: '1110', debit: 0, credit: recovered,   description: 'Advance recovered' },
      { code: '2100', debit: 0, credit: withholding, description: 'Payroll withholding' },
    ],
  });
}

/**
 * An operating expense debits the expense and credits cash (paid) or payables
 * (unpaid). A refund reverses it (money comes back in).
 */
async function postExpense(tx, { businessId, amount, paid = true, isRefund = false, description, sourceId, createdById }) {
  const amt = round2(amount);
  if (amt <= 0) return null;
  const cashOrAp = paid ? '1000' : '2000';
  const lines = isRefund
    ? [{ code: cashOrAp, debit: amt, credit: 0, description: 'Expense refund' }, { code: '5200', debit: 0, credit: amt, description: description || 'Expense reversed' }]
    : [{ code: '5200', debit: amt, credit: 0, description: description || 'Operating expense' }, { code: cashOrAp, debit: 0, credit: amt, description: paid ? 'Paid' : 'Payable' }];
  return postJournal(tx, { businessId, description: description || 'Expense', sourceType: 'expense', sourceId, createdById, lines });
}

/**
 * Per-account net balances (positive = the account's normal side), optionally
 * within a date range on the journal entry date. Reads via the prisma singleton.
 */
async function accountBalances(businessId, { from, to } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT a.code, a.name, a.type, a.normal_balance,
      COALESCE(SUM(jl.debit), 0)  AS total_debit,
      COALESCE(SUM(jl.credit), 0) AS total_credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND (${from ?? null}::date IS NULL OR je.date >= ${from ?? null}::date)
      AND (${to   ?? null}::date IS NULL OR je.date <= ${to   ?? null}::date)
    WHERE a.business_id = ${businessId}::uuid
    GROUP BY a.code, a.name, a.type, a.normal_balance
    ORDER BY a.code
  `;
  return rows.map(r => {
    const debit = parseFloat(r.total_debit), credit = parseFloat(r.total_credit);
    const balance = r.normal_balance === 'debit' ? debit - credit : credit - debit;
    return { code: r.code, name: r.name, type: r.type, balance: parseFloat(balance.toFixed(2)) };
  });
}

module.exports = { CHART, ensureChart, postJournal, postSale, postFolioCharge, postFolioPayment, postAdvance, postPayroll, postExpense, accountBalances, tenderAccountCode, round2 };
