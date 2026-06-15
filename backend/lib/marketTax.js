/**
 * Seed / sync market-configured tax rates (e.g. Somaliland GST 2.5%).
 */
const prisma = require('./prisma');
const { getMarket } = require('./markets');

async function ensureMarketTaxRate(businessId, marketKey) {
  const profile = getMarket(marketKey);
  const compliance = profile.taxCompliance;
  if (!compliance?.rate || compliance.rate <= 0) return null;

  const name = `${compliance.type.toUpperCase()} ${compliance.rate * 100}% (${profile.name})`;
  const isActive = compliance.status !== 'pending_rollout';

  const existing = await prisma.taxRate.findFirst({
    where: { businessId, name },
  });

  if (existing) {
    if (isActive && (!existing.isActive || !existing.isDefault)) {
      await prisma.taxRate.updateMany({
        where: { businessId, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
      await prisma.taxRate.update({
        where: { id: existing.id },
        data: { isActive: true, isDefault: true },
      });
    }
    return existing;
  }

  if (isActive) {
    await prisma.taxRate.updateMany({
      where: { businessId, isDefault: true },
      data: { isDefault: false },
    });
  }

  return prisma.taxRate.create({
    data: {
      businessId,
      name,
      rate: compliance.rate,
      region: profile.key,
      isDefault: isActive,
      isInclusive: false,
      isActive,
    },
  });
}

async function backfillMarketTaxRates() {
  const businesses = await prisma.business.findMany({
    select: { id: true, market: true },
  });
  for (const biz of businesses) {
    await ensureMarketTaxRate(biz.id, biz.market || 'somaliland');
  }
}

module.exports = { ensureMarketTaxRate, backfillMarketTaxRates };
