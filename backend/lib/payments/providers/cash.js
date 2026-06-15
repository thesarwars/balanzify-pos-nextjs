/**
 * Cash Payment Provider
 *
 * No external API. Tracks tender amount and change due.
 * Always succeeds — the physical exchange is the confirmation.
 */

module.exports = {
  name:            'Cash',
  description:     'Physical cash payment',
  type:            'cash',
  currencies:      ['USD', 'SOS', 'ETB', 'KES', 'DJF', 'SAR', 'AED'],
  requiresPin:     false,
  requiresPhone:   false,
  requiresNetwork: false,
  supportsRefund:  true,

  async charge({ amount, tendered, currency = 'USD', meta = {} }) {
    const change = Math.max(0, parseFloat(tendered || amount) - parseFloat(amount));
    return {
      success:    true,
      provider:   'cash',
      reference:  `CASH-${Date.now()}`,
      amount:     parseFloat(amount),
      tendered:   parseFloat(tendered || amount),
      change,
      currency,
      status:     'completed',
      completedAt: new Date().toISOString(),
    };
  },

  async refund({ amount, currency = 'USD', originalReference, meta = {} }) {
    return {
      success:   true,
      provider:  'cash',
      reference: `CASH-REF-${Date.now()}`,
      amount:    parseFloat(amount),
      currency,
      status:    'completed',
      note:      'Return cash to customer from till',
      completedAt: new Date().toISOString(),
    };
  },

  async verify({ reference }) {
    // Cash is always verified — no external call needed
    return { verified: true, reference, status: 'completed' };
  },

  async getStatus({ reference }) {
    return { reference, status: 'completed', provider: 'cash' };
  },
};
