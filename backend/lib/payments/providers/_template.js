/**
 * [Provider Name] Payment Provider — TEMPLATE
 *
 * Copy this file to add a new payment method.
 * Register in lib/payments/index.js with:
 *   registry.register('yourkey', require('./providers/yourprovider'));
 *
 * Required env vars:
 *   YOURPROVIDER_API_KEY=...
 */

module.exports = {
  // Metadata — returned by GET /api/v1/payments/methods
  name:            'Provider Name',
  description:     'Short description shown in POS',
  type:            'mobile_money',  // 'cash' | 'mobile_money' | 'card' | 'bank_transfer' | 'credit' | 'external'
  currencies:      ['USD'],
  requiresPhone:   false,
  requiresNetwork: true,
  requiresPin:     false,
  supportsRefund:  true,

  /**
   * Charge the customer.
   * @returns {Promise<ChargeResult>}
   *   success:    boolean
   *   provider:   string
   *   reference:  string  — unique transaction ID for this charge
   *   amount:     number
   *   currency:   string
   *   status:     'completed' | 'pending' | 'failed'
   *   completedAt: ISO string | null
   */
  async charge({ amount, currency, phone, reference, meta }) {
    throw new Error('charge() not implemented');
  },

  /**
   * Refund a previous charge.
   * @returns {Promise<RefundResult>}
   */
  async refund({ amount, currency, originalReference, meta }) {
    throw new Error('refund() not implemented');
  },

  /**
   * Verify whether a charge completed (used for async providers).
   * @returns {Promise<{ verified: boolean, reference: string, status: string }>}
   */
  async verify({ reference }) {
    throw new Error('verify() not implemented');
  },

  /**
   * Get current status of a transaction.
   */
  async getStatus({ reference }) {
    throw new Error('getStatus() not implemented');
  },
};
