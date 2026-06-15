/**
 * Credit / Store Account Provider
 *
 * Records a sale against the customer's credit account.
 * No money moves at time of sale — tracked as outstanding balance.
 * Repayment via POST /api/v1/sales/customer-payment.
 */

module.exports = {
  name:            'Credit Account',
  description:     'Bill to customer credit account — pay later',
  type:            'credit',
  currencies:      ['USD', 'SOS', 'ETB', 'KES', 'DJF'],
  requiresPhone:   false,
  requiresNetwork: false,
  requiresPin:     false,
  supportsRefund:  true,

  async charge({ amount, currency = 'USD', customerId, creditLimit, currentBalance, meta = {} }) {
    if (!customerId) {
      throw Object.assign(new Error('Credit sales require a customer account.'), { statusCode: 400 });
    }
    const newBalance = parseFloat(currentBalance || 0) + parseFloat(amount);
    if (creditLimit && newBalance > parseFloat(creditLimit)) {
      throw Object.assign(
        new Error(`Credit limit exceeded. Limit: ${creditLimit}, Current: ${currentBalance}, Requested: ${amount}`),
        { statusCode: 400, code: 'CREDIT_LIMIT_EXCEEDED' }
      );
    }
    return {
      success:    true,
      provider:   'credit',
      reference:  `CREDIT-${Date.now()}`,
      amount:     parseFloat(amount),
      currency,
      customerId,
      status:     'completed',
      note:       'Charged to customer credit account',
      completedAt: new Date().toISOString(),
    };
  },

  async refund({ amount, customerId, currency = 'USD', meta = {} }) {
    return {
      success:    true,
      provider:   'credit',
      reference:  `CREDIT-REF-${Date.now()}`,
      amount:     parseFloat(amount),
      currency,
      customerId,
      status:     'completed',
      note:       'Credit reversed — outstanding balance reduced',
      completedAt: new Date().toISOString(),
    };
  },

  async verify({ reference }) {
    return { verified: true, reference, status: 'completed' };
  },

  async getStatus({ reference }) {
    return { reference, status: 'completed', provider: 'credit' };
  },
};
