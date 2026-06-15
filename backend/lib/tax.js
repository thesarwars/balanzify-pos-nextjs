/**
 * Tax Engine
 *
 * Computes tax for a sale based on the business's configured tax rates.
 * Each line item can have its own tax rate (assigned to the product).
 * Falls back to the business's default rate if the product has none.
 *
 * Supports:
 *   - Exclusive tax (added on top of price) — VAT in Kenya, GST in Australia
 *   - Inclusive tax (already in price) — common in retail pricing
 *   - Zero-rated lines (rate = 0)
 *   - Multiple rates on a single sale (standard + zero-rated mixed cart)
 *
 * Tax is computed AFTER discounts, BEFORE loyalty redemption.
 * This matches IFRS revenue recognition and most tax authority rules.
 */

const prisma = require('./prisma');

/**
 * Load all active tax rates for a business, keyed by ID.
 * Cached per request — called once per checkout.
 */
async function loadRates(businessId) {
  const rates = await prisma.taxRate.findMany({
    where: { businessId, isActive: true },
    orderBy: { isDefault: 'desc' },
  });
  const byId      = {};
  let defaultRate = null;
  for (const r of rates) {
    byId[r.id] = r;
    if (r.isDefault) defaultRate = r;
  }
  return { byId, defaultRate };
}

/**
 * Compute tax for a list of line items.
 *
 * @param {object[]} items  - Each item: { lineTotal, taxRateId? }
 * @param {string}   businessId
 * @returns {{ lines: object[], totalTax: number, breakdown: object[] }}
 */
async function computeTax(items, businessId) {
  const { byId, defaultRate } = await loadRates(businessId);

  // If no tax rates configured for this business — zero tax, no error
  if (!defaultRate && Object.keys(byId).length === 0) {
    return {
      lines:      items.map(i => ({ ...i, taxAmount: 0, taxRate: 0, taxRateId: null })),
      totalTax:   0,
      breakdown:  [],
    };
  }

  const breakdown = {}; // taxRateId → { name, rate, taxableAmount, taxAmount }
  const lines = items.map(item => {
    const rate = item.taxRateId ? byId[item.taxRateId] : defaultRate;
    if (!rate) return { ...item, taxAmount: 0, taxRate: 0, taxRateId: null };

    const rateDecimal = parseFloat(rate.rate);
    let taxableAmount, taxAmount;

    if (rate.isInclusive) {
      // Tax is already included in lineTotal
      // Extract it: taxAmount = lineTotal - (lineTotal / (1 + rate))
      taxableAmount = parseFloat(item.lineTotal) / (1 + rateDecimal);
      taxAmount     = parseFloat(item.lineTotal) - taxableAmount;
    } else {
      // Tax added on top
      taxableAmount = parseFloat(item.lineTotal);
      taxAmount     = taxableAmount * rateDecimal;
    }

    taxAmount = Math.round(taxAmount * 100) / 100; // round to cents

    if (!breakdown[rate.id]) {
      breakdown[rate.id] = { name: rate.name, rate: rateDecimal, taxableAmount: 0, taxAmount: 0, isInclusive: rate.isInclusive };
    }
    breakdown[rate.id].taxableAmount += taxableAmount;
    breakdown[rate.id].taxAmount     += taxAmount;

    return { ...item, taxAmount, taxRate: rateDecimal, taxRateId: rate.id };
  });

  const totalTax = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);

  return {
    lines,
    totalTax:  Math.round(totalTax * 100) / 100,
    breakdown: Object.values(breakdown).map(b => ({
      ...b,
      taxableAmount: Math.round(b.taxableAmount * 100) / 100,
      taxAmount:     Math.round(b.taxAmount     * 100) / 100,
    })),
  };
}

module.exports = { computeTax, loadRates };
