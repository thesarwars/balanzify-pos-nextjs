/**
 * Currency Conversion Utility
 *
 * Fetches live rates from Open Exchange Rates (free tier) or falls back
 * to business-configured manual rates.
 *
 * Live rates update every 60 minutes in the background.
 * Manual rates are always the fallback — no external dependency required.
 *
 * Usage:
 *   const { convert, getRates } = require('./currency');
 *   const { amount, rate } = await convert(100, 'USD', 'SOS', businessId);
 */

const prisma = require('./prisma');
const { logger } = require('./logger');

// In-memory rate cache per business — TTL 60 minutes
const _cache = new Map(); // businessId → { rates: {}, fetchedAt: timestamp }
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get all exchange rates for a business.
 * Tries live API first, falls back to manual rates in DB.
 */
async function getRates(businessId, baseCurrency = 'USD') {
  const cached = _cache.get(businessId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.rates;
  }

  let liveRates = null;

  // Try Open Exchange Rates if configured
  if (process.env.OPEN_EXCHANGE_RATES_APP_ID) {
    try {
      const res = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${process.env.OPEN_EXCHANGE_RATES_APP_ID}&base=${baseCurrency}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = await res.json();
        liveRates = data.rates;
        logger.info('exchange_rates_fetched', { source: 'open_exchange_rates', base: baseCurrency });
      }
    } catch (err) {
      logger.warn('exchange_rates_fetch_failed', { message: err.message });
    }
  }

  // Merge with manual rates from DB (manual rates override live rates for local currencies)
  const manualRates = await prisma.exchangeRate.findMany({
    where: { businessId, fromCurrency: baseCurrency },
  });

  const rates = { ...(liveRates || {}) };
  for (const r of manualRates) {
    rates[r.toCurrency] = parseFloat(r.rate);  // Manual overrides live
  }
  rates[baseCurrency] = 1; // Base currency = 1

  _cache.set(businessId, { rates, fetchedAt: Date.now() });
  return rates;
}

/**
 * Convert amount from one currency to another.
 * @returns {{ amount: number, rate: number, fromCurrency: string, toCurrency: string }}
 */
async function convert(amount, from, to, businessId) {
  if (from === to) return { amount: parseFloat(amount), rate: 1, fromCurrency: from, toCurrency: to };

  const rates = await getRates(businessId, 'USD');

  // Convert via USD as base
  const fromToUSD = from === 'USD' ? 1 : (1 / (rates[from] || 1));
  const usdToTo   = to   === 'USD' ? 1 : (rates[to]   || 1);
  const rate      = fromToUSD * usdToTo;
  const converted = parseFloat((parseFloat(amount) * rate).toFixed(4));

  return { amount: converted, rate, fromCurrency: from, toCurrency: to };
}

/** Clear cached rates for a business — called when manual rates are updated */
function invalidateCache(businessId) {
  _cache.delete(businessId);
}

module.exports = { getRates, convert, invalidateCache };
