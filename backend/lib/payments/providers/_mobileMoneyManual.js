/**
 * Manual-confirm mobile-money provider factory.
 *
 * Most mobile-money rails in the corridor (eDahab, EVC Plus, Telebirr, CBE Birr…)
 * have no public self-serve API — automating them needs a telco B2B agreement.
 * But you don't need that to transact: the customer pays to the merchant till and
 * the cashier confirms the transfer (the confirmation SMS / reference) at the
 * counter, so the charge settles immediately. This factory stamps out such a
 * provider for any rail in one line.
 *
 * Automated (push/USSD + callback) mode is added per-rail later, exactly as
 * M-Pesa (Daraja) and Zaad already demonstrate — without changing checkout.
 */
const { logger } = require('../../logger');

module.exports = function makeManualMobileMoney({ key, name, description, currencies = ['USD'] }) {
  return {
    name,
    description,
    type:            'mobile_money',
    currencies,
    requiresPhone:   false,
    requiresNetwork: false,
    requiresPin:     false,
    supportsRefund:  true,
    mode:            'manual_confirm',

    async charge({ amount, currency = currencies[0], phone, reference, meta = {} }) {
      logger.info('mm_manual_charge', { key, amount });
      // The cashier has already confirmed the customer's transfer; settle now.
      return {
        success:     true,
        provider:    key,
        reference:   reference || `${key.toUpperCase()}-${Date.now()}`,
        amount:      parseFloat(amount),
        currency,
        phone:       phone || null,
        status:      'completed',
        mode:        'manual_confirm',
        note:        `Cashier confirmed customer ${name} transfer`,
        completedAt: new Date().toISOString(),
      };
    },

    async refund({ amount, currency = currencies[0], phone }) {
      return {
        success:     true,
        provider:    key,
        reference:   `${key.toUpperCase()}-REF-${Date.now()}`,
        amount:      parseFloat(amount),
        currency,
        status:      'completed',
        mode:        'manual_confirm',
        note:        `Transfer ${amount} ${currency} back to ${phone || 'the customer'} via ${name}`,
        completedAt: new Date().toISOString(),
      };
    },

    async verify({ reference })    { return { verified: true, reference, status: 'completed', provider: key, mode: 'manual_confirm' }; },
    async getStatus({ reference }) { return { reference, status: 'completed', provider: key, mode: 'manual_confirm' }; },
  };
};
