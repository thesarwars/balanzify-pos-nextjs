/**
 * Payment Provider Registry
 *
 * The single source of truth for all payment providers.
 * Checkout, refunds, and reports interact only with this registry —
 * never with individual providers directly.
 *
 * Adding a new payment method:
 *   1. Create backend/lib/payments/providers/yourprovider.js
 *   2. Register it here with registry.register('key', provider)
 *   3. Done — no changes to checkout, schema, or reports required.
 */

const { logger } = require('../logger');

class PaymentRegistry {
  constructor() {
    this._providers = new Map();
  }

  /**
   * Register a payment provider.
   * @param {string} key      - Unique identifier used in API requests (e.g. 'zaad', 'mpesa', 'stripe')
   * @param {object} provider - Must implement the PaymentProvider interface
   */
  register(key, provider) {
    const required = ['charge', 'refund', 'verify', 'getStatus'];
    for (const method of required) {
      if (typeof provider[method] !== 'function') {
        throw new Error(`Payment provider '${key}' is missing required method: ${method}`);
      }
    }
    this._providers.set(key, provider);
    logger.info('payment_provider_registered', { key, name: provider.name || key });
  }

  /**
   * Get a registered provider by key.
   * Throws a safe 400 if the key is unknown — never silently falls through.
   */
  get(key) {
    const provider = this._providers.get(key);
    if (!provider) {
      const available = [...this._providers.keys()].join(', ');
      throw Object.assign(
        new Error(`Unknown payment method: '${key}'. Available: ${available}`),
        { statusCode: 400, code: 'UNKNOWN_PAYMENT_METHOD' }
      );
    }
    return provider;
  }

  has(key) { return this._providers.has(key); }

  /** All registered providers with their metadata — used by /api/v1/payments/methods */
  list() {
    return [...this._providers.entries()].map(([key, p]) => ({
      key,
      name:            p.name            || key,
      description:     p.description     || '',
      type:            p.type            || 'external',
      currencies:      p.currencies      || ['USD'],
      requiresPin:     p.requiresPin     || false,
      requiresPhone:   p.requiresPhone   || false,
      requiresNetwork: p.requiresNetwork || false,
      supportsRefund:  p.supportsRefund  !== false,
      icon:            p.icon            || null,
    }));
  }
}

module.exports = new PaymentRegistry();
