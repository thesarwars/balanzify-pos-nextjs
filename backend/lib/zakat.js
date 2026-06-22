/**
 * Zakat — the Islamic wealth almsgiving, computed straight off the ledger.
 *
 * For a trading business, zakatable wealth is its liquid and trade assets — cash,
 * mobile money, bank, receivables and inventory held for sale — net of immediate
 * liabilities (payables, tax due, financing due). Zakat falls due at 2.5% once
 * that net wealth has stayed at or above the nisab threshold for a lunar year
 * (hawl). Because every vertical already posts to the general ledger, we can
 * derive the base exactly rather than asking the owner to tally it by hand — a
 * natural extension of the Sharia-compliant positioning.
 *
 * Nisab is the value of 85g of gold (or 595g of silver) and moves with the
 * market, so it's a caller/config input, not a hardcoded constant.
 */
const accounting = require('./accounting');

const ZAKATABLE_ASSETS = [
  ['1000', 'Cash'], ['1010', 'Mobile Money'], ['1020', 'Bank / Card'],
  ['1100', 'Accounts Receivable'], ['1200', 'Inventory'],
];
const DEDUCTIBLE_LIABILITIES = [
  ['2000', 'Accounts Payable'], ['2100', 'Tax Payable'], ['2200', 'Financing Payable'],
];
const ZAKAT_RATE = 0.025;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Assess Zakat from the ledger.
 *   assess(businessId, { nisab, from, to })
 * `nisab` (optional) gates whether Zakat is actually due; the 2.5% is always
 * reported so the owner sees the figure even before nisab is configured.
 */
async function assess(businessId, { nisab = null, from, to } = {}) {
  const balances = await accounting.accountBalances(businessId, { from, to });
  const byCode = Object.fromEntries(balances.map(b => [b.code, b.balance]));

  const assetLines = ZAKATABLE_ASSETS.map(([code, name]) => ({ code, name, amount: round2(byCode[code] || 0) }));
  const liabilityLines = DEDUCTIBLE_LIABILITIES.map(([code, name]) => ({ code, name, amount: round2(byCode[code] || 0) }));

  const assets = round2(assetLines.reduce((s, l) => s + l.amount, 0));
  const liabilities = round2(liabilityLines.reduce((s, l) => s + l.amount, 0));
  const base = Math.max(0, round2(assets - liabilities));

  const threshold = nisab != null ? Number(nisab) : null;
  const meetsNisab = threshold != null ? base >= threshold : null;
  // Zakat is only payable when nisab is met; when unknown, we still surface the
  // 2.5% figure as informational so it's never silently zero.
  const due = meetsNisab === true;
  const amount = (meetsNisab === false) ? 0 : round2(base * ZAKAT_RATE);

  return {
    base, assets, liabilities,
    rate: ZAKAT_RATE,
    nisab: threshold, meets_nisab: meetsNisab, due, amount,
    assetLines, liabilityLines,
  };
}

module.exports = { assess, ZAKAT_RATE, ZAKATABLE_ASSETS, DEDUCTIBLE_LIABILITIES };
