/**
 * Stripe Payment Provider
 *
 * Handles card payments via Stripe Terminal (in-person) or
 * Stripe PaymentIntents (online/MOTO).
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY     (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET (from Stripe dashboard)
 *   STRIPE_TERMINAL_LOCATION (optional — for Terminal reader registration)
 */

const { logger } = require('../../logger');

let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw Object.assign(new Error('Stripe not configured. Set STRIPE_SECRET_KEY in .env'), { statusCode: 503 });
    }
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

module.exports = {
  name:            'Stripe',
  description:     'Card payments via Stripe (Visa, Mastercard, Amex)',
  type:            'card',
  currencies:      ['USD', 'EUR', 'GBP', 'AED', 'SAR'],
  requiresPhone:   false,
  requiresNetwork: true,
  requiresPin:     false,
  supportsRefund:  true,

  async charge({ amount, currency = 'USD', paymentMethodId, description, reference, meta = {} }) {
    const stripe = getStripe();
    const amountCents = Math.round(parseFloat(amount) * 100);  // Stripe uses smallest currency unit

    logger.info('stripe_charge_initiated', { amount, currency, amountCents });

    try {
      const intent = await stripe.paymentIntents.create({
        amount:               amountCents,
        currency:             currency.toLowerCase(),
        payment_method:       paymentMethodId,
        confirm:              true,
        description:          description || 'Balanzify POS',
        metadata: {
          balanzify_reference: reference || '',
          ...meta,
        },
        automatic_payment_methods: { enabled: false },
      });

      return {
        success:    intent.status === 'succeeded',
        provider:   'stripe',
        reference:  intent.id,
        amount:     parseFloat(amount),
        currency:   currency.toUpperCase(),
        status:     intent.status === 'succeeded' ? 'completed' : intent.status,
        last4:      intent.payment_method_details?.card?.last4 || null,
        brand:      intent.payment_method_details?.card?.brand || null,
        completedAt: intent.status === 'succeeded' ? new Date().toISOString() : null,
      };
    } catch (err) {
      logger.error('stripe_charge_failed', { message: err.message, code: err.code });
      throw Object.assign(
        new Error(`Card payment failed: ${err.message}`),
        { statusCode: err.statusCode === 402 ? 402 : 502, code: err.code || 'STRIPE_CHARGE_FAILED' }
      );
    }
  },

  async refund({ amount, originalReference, reason = 'requested_by_customer', meta = {} }) {
    const stripe = getStripe();
    const amountCents = Math.round(parseFloat(amount) * 100);

    try {
      const refund = await stripe.refunds.create({
        payment_intent: originalReference,
        amount:         amountCents,
        reason,
        metadata: meta,
      });
      return {
        success:   refund.status === 'succeeded',
        provider:  'stripe',
        reference: refund.id,
        amount:    parseFloat(amount),
        status:    refund.status,
        completedAt: refund.status === 'succeeded' ? new Date().toISOString() : null,
      };
    } catch (err) {
      throw Object.assign(new Error(`Stripe refund failed: ${err.message}`), { statusCode: 502 });
    }
  },

  async verify({ reference }) {
    const stripe = getStripe();
    try {
      const intent = await stripe.paymentIntents.retrieve(reference);
      return {
        verified:  intent.status === 'succeeded',
        reference,
        status:    intent.status,
        amount:    intent.amount / 100,
        currency:  intent.currency.toUpperCase(),
      };
    } catch (err) {
      return { verified: false, reference, status: 'unknown', error: err.message };
    }
  },

  async getStatus({ reference }) {
    const result = await this.verify({ reference });
    return { ...result, provider: 'stripe' };
  },
};
