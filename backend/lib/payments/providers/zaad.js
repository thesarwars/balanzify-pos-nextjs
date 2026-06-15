/**
 * Zaad Payment Provider (Telesom, Somaliland)
 *
 * Zaad is a mobile money service operated by Telesom in Somaliland.
 * Payments are initiated by the merchant sending a push request to the
 * customer's phone number, or the customer pays to a merchant till number.
 *
 * Integration approach:
 *   - Merchants with a Zaad business account get a merchant till number
 *   - Customers USSD-transfer to the till number
 *   - Merchant verifies via Telesom's API or manual confirmation
 *
 * Until Telesom provides a formal API, this provider operates in
 * MANUAL_CONFIRM mode — the cashier confirms the customer's transfer
 * reference number. Switch to AUTOMATED mode by adding API credentials.
 *
 * To switch to automated mode:
 *   Set ZAAD_API_URL, ZAAD_MERCHANT_ID, ZAAD_API_KEY in .env
 */

const { logger } = require('../../logger');
const axios = require('axios').default;

const MODE = process.env.ZAAD_API_URL ? 'automated' : 'manual_confirm';

module.exports = {
  name:            'Zaad',
  description:     'Telesom Zaad mobile money (Somaliland)',
  type:            'mobile_money',
  currencies:      ['USD', 'SOS'],
  requiresPin:     false,
  requiresPhone:   true,   // Customer phone number needed for push payments
  requiresNetwork: true,
  supportsRefund:  true,
  mode:            MODE,

  async charge({ amount, currency = 'USD', phone, reference, merchantTill, meta = {} }) {
    logger.info('zaad_charge_initiated', { amount, currency, mode: MODE, phone: phone?.slice(-4) });

    if (MODE === 'automated') {
      // ── Automated: push payment request to customer phone ──────────────────
      // Replace with actual Telesom API endpoint when available
      try {
        const response = await axios.post(`${process.env.ZAAD_API_URL}/charge`, {
          merchant_id:  process.env.ZAAD_MERCHANT_ID,
          phone_number: phone,
          amount,
          currency,
          reference,
          description:  meta.description || 'Balanzify POS',
        }, {
          headers: { 'X-Api-Key': process.env.ZAAD_API_KEY },
          timeout: 30000,
        });

        return {
          success:   response.data.status === 'success',
          provider:  'zaad',
          reference: response.data.transaction_id || reference,
          amount:    parseFloat(amount),
          currency,
          phone,
          status:    response.data.status === 'success' ? 'completed' : 'pending',
          completedAt: response.data.status === 'success' ? new Date().toISOString() : null,
          rawResponse: response.data,
        };
      } catch (err) {
        logger.error('zaad_charge_failed', { message: err.message, amount });
        throw Object.assign(
          new Error(`Zaad payment failed: ${err.response?.data?.message || err.message}`),
          { statusCode: 502, code: 'ZAAD_CHARGE_FAILED' }
        );
      }

    } else {
      // ── Manual confirm: cashier records customer-provided reference ─────────
      // reference is the Zaad transaction ID the customer shows on their phone
      if (!reference) {
        throw Object.assign(
          new Error('Zaad reference number required. Ask the customer for their Zaad transaction ID.'),
          { statusCode: 400, code: 'ZAAD_REFERENCE_REQUIRED' }
        );
      }
      return {
        success:    true,
        provider:   'zaad',
        reference,
        amount:     parseFloat(amount),
        currency,
        phone,
        status:     'completed',
        mode:       'manual_confirm',
        note:       'Cashier confirmed customer Zaad transaction',
        completedAt: new Date().toISOString(),
      };
    }
  },

  async refund({ amount, currency = 'USD', originalReference, phone, meta = {} }) {
    logger.info('zaad_refund_initiated', { amount, originalReference, mode: MODE });

    if (MODE === 'automated') {
      try {
        const response = await axios.post(`${process.env.ZAAD_API_URL}/refund`, {
          merchant_id:    process.env.ZAAD_MERCHANT_ID,
          original_reference: originalReference,
          amount,
          currency,
        }, {
          headers: { 'X-Api-Key': process.env.ZAAD_API_KEY },
          timeout: 30000,
        });
        return {
          success:   response.data.status === 'success',
          provider:  'zaad',
          reference: response.data.refund_id,
          amount:    parseFloat(amount),
          currency,
          status:    response.data.status,
          completedAt: new Date().toISOString(),
        };
      } catch (err) {
        throw Object.assign(
          new Error(`Zaad refund failed: ${err.response?.data?.message || err.message}`),
          { statusCode: 502, code: 'ZAAD_REFUND_FAILED' }
        );
      }
    }

    // Manual confirm refund — cashier initiates Zaad transfer from merchant account
    return {
      success:   true,
      provider:  'zaad',
      reference: `ZAAD-REF-${Date.now()}`,
      amount:    parseFloat(amount),
      currency,
      status:    'completed',
      mode:      'manual_confirm',
      note:      `Transfer $${amount} ${currency} to customer ${phone || ''} via Zaad merchant app`,
      completedAt: new Date().toISOString(),
    };
  },

  async verify({ reference }) {
    if (MODE === 'manual_confirm') return { verified: true, reference, status: 'completed', mode: 'manual_confirm' };
    try {
      const response = await axios.get(`${process.env.ZAAD_API_URL}/transaction/${reference}`, {
        headers: { 'X-Api-Key': process.env.ZAAD_API_KEY },
        timeout: 10000,
      });
      return {
        verified:  response.data.status === 'completed',
        reference,
        status:    response.data.status,
        amount:    response.data.amount,
        phone:     response.data.phone,
      };
    } catch (err) {
      return { verified: false, reference, status: 'unknown', error: err.message };
    }
  },

  async getStatus({ reference }) {
    if (MODE === 'manual_confirm') return { reference, status: 'completed', provider: 'zaad', mode: 'manual_confirm' };
    try {
      const response = await axios.get(`${process.env.ZAAD_API_URL}/transaction/${reference}`, {
        headers: { 'X-Api-Key': process.env.ZAAD_API_KEY },
        timeout: 10000,
      });
      return { reference, status: response.data.status, provider: 'zaad', rawResponse: response.data };
    } catch (err) {
      return { reference, status: 'unknown', provider: 'zaad', error: err.message };
    }
  },
};
