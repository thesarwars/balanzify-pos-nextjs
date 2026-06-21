/**
 * Embedded financing — Sharia-compliant working-capital advances.
 *
 * The merchant receives `principal` and owes a fixed, fully-disclosed
 * `totalRepayable = principal + feeAmount`. The fee is a flat Murabaha-style
 * markup — NOT interest: it does not accrue with time, does not compound, and
 * there are no late-payment penalties. This is a deliberate design choice for
 * the (Muslim-majority) launch markets where riba is prohibited.
 *
 * GL postings (the merchant's books):
 *   disburse → Dr Cash (principal) + Dr Financing Cost (fee) / Cr Financing Payable (total)
 *   repay    → Dr Financing Payable / Cr Cash
 *
 * Repayment is manual or auto-collected as a fixed share of daily takings.
 */
const prisma = require('./prisma');
const accounting = require('./accounting');
const underwriting = require('./underwriting');

// Flat, disclosed financing fee (a markup, not a rate). Tunable per market.
const FLAT_FEE_RATE = 0.06;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const err = (msg, statusCode = 400, code) => Object.assign(new Error(msg), { statusCode, code });

async function createOffer({ businessId, principal, termDays = 30, collectionRate = 0.10, createdById }) {
  const assessment = await underwriting.assess(businessId);
  if (!assessment.eligible) throw err('Business is not eligible for financing yet.', 400, 'NOT_ELIGIBLE');
  if (!(principal > 0) || principal > assessment.recommended_limit) {
    throw err(`Principal must be between 0 and the approved limit (${assessment.recommended_limit}).`, 400, 'OVER_LIMIT');
  }
  const fee = round2(principal * FLAT_FEE_RATE);
  const total = round2(principal + fee);
  return prisma.financingAdvance.create({
    data: {
      businessId, reference: `FIN-${Date.now()}`,
      principal: round2(principal), feeAmount: fee, totalRepayable: total,
      termDays, collectionRate, score: assessment.score, status: 'offered', createdById,
    },
  });
}

async function disburse({ businessId, advanceId, createdById }) {
  return prisma.$transaction(async (tx) => {
    const adv = await tx.financingAdvance.findFirst({ where: { id: advanceId, businessId } });
    if (!adv) throw err('Advance not found.', 404);
    if (adv.status !== 'offered') throw err('Advance is not in an offerable state.', 400);
    const active = await tx.financingAdvance.count({ where: { businessId, status: 'active' } });
    if (active > 0) throw err('An active advance already exists; settle it first.', 400, 'ACTIVE_EXISTS');

    const updated = await tx.financingAdvance.update({ where: { id: adv.id }, data: { status: 'active', disbursedAt: new Date() } });
    await accounting.postJournal(tx, {
      businessId, description: `Financing disbursed — ${adv.reference}`,
      sourceType: 'financing_disbursement', sourceId: adv.id, createdById,
      lines: [
        { code: '1000', debit: parseFloat(adv.principal), credit: 0, description: 'Principal received' },
        { code: '5300', debit: parseFloat(adv.feeAmount), credit: 0, description: 'Financing fee (fixed Murabaha markup)' },
        { code: '2200', debit: 0, credit: parseFloat(adv.totalRepayable), description: 'Financing payable' },
      ],
    });
    return updated;
  });
}

// Apply a repayment (caller supplies the transaction). Caps at the remaining balance.
async function repay(tx, { businessId, advanceId, amount, source = 'manual', createdById }) {
  const adv = await tx.financingAdvance.findFirst({ where: { id: advanceId, businessId } });
  if (!adv) throw err('Advance not found.', 404);
  if (adv.status !== 'active') throw err('Advance is not active.', 400);

  const remaining = round2(parseFloat(adv.totalRepayable) - parseFloat(adv.amountRepaid));
  const pay = Math.min(round2(amount), remaining);
  if (pay <= 0) return { advance: adv, amount_paid: 0, settled: false };

  const newRepaid = round2(parseFloat(adv.amountRepaid) + pay);
  const settled = newRepaid >= parseFloat(adv.totalRepayable) - 0.001;
  await tx.financingRepayment.create({ data: { advanceId: adv.id, businessId, amount: pay, source } });
  await tx.financingAdvance.update({ where: { id: adv.id }, data: { amountRepaid: newRepaid, status: settled ? 'settled' : 'active', ...(settled && { settledAt: new Date() }) } });
  await accounting.postJournal(tx, {
    businessId, description: `Financing repayment — ${adv.reference}`,
    sourceType: 'financing_repayment', sourceId: adv.id, createdById,
    lines: [
      { code: '2200', debit: pay, credit: 0, description: 'Financing payable reduced' },
      { code: '1000', debit: 0, credit: pay, description: 'Cash repaid' },
    ],
  });
  return { amount_paid: pay, settled };
}

// Auto-collect a fixed share of a sale's takings toward the active advance —
// the lock-in mechanic. Runs inside the sale transaction; no-op if none active.
async function autoCollect(tx, { businessId, collectible, createdById }) {
  if (!(collectible > 0)) return;
  const adv = await tx.financingAdvance.findFirst({ where: { businessId, status: 'active' } });
  if (!adv || parseFloat(adv.collectionRate) <= 0) return;
  const remaining = round2(parseFloat(adv.totalRepayable) - parseFloat(adv.amountRepaid));
  if (remaining <= 0) return;
  const amount = Math.min(round2(collectible * parseFloat(adv.collectionRate)), remaining);
  if (amount <= 0) return;
  await repay(tx, { businessId, advanceId: adv.id, amount, source: 'auto_sales', createdById });
}

module.exports = { createOffer, disburse, repay, autoCollect, FLAT_FEE_RATE };
