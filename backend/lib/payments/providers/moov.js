/**
 * Moov Financial Payment Provider
 *
 * Handles ACH bank transfers and instant payouts via Moov.io.
 * Balanzify's primary infrastructure partner for US market.
 *
 * Required env vars:
 *   MOOV_API_KEY, MOOV_ACCOUNT_ID
 *   MOOV_ENV (sandbox | production)
 *
 * Moov is asynchronous by nature — ACH transfers settle in 1-3 days.
 * Instant payments require Moov's RTP (Real-Time Payments) network.
 */

const { logger } = require('../../logger');
const axios = require('axios').default;

const BASE_URL = process.env.MOOV_ENV === 'production'
  ? 'https://api.moov.io'
  : 'https://api.sandbox.moov.io';

let _cachedToken = null;
let _tokenExpiry  = 0;

async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  const { data } = await axios.post(`${BASE_URL}/oauth2/token`,
    'grant_type=client_credentials&scope=/accounts.read /transfers.write /transfers.read',
    {
      auth: { username: process.env.MOOV_API_KEY, password: process.env.MOOV_API_SECRET || '' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );
  _cachedToken = data.access_token;
  _tokenExpiry  = Date.now() + (data.expires_in - 60) * 1000;
  return _cachedToken;
}

module.exports = {
  name:            'Moov',
  description:     'ACH bank transfer via Moov Financial (US)',
  type:            'bank_transfer',
  currencies:      ['USD'],
  requiresPhone:   false,
  requiresNetwork: true,
  requiresPin:     false,
  supportsRefund:  true,

  async charge({ amount, currency = 'USD', sourceAccountId, description, reference, meta = {} }) {
    if (!process.env.MOOV_API_KEY) {
      throw Object.assign(new Error('Moov not configured. Set MOOV_API_KEY in .env'), { statusCode: 503 });
    }
    const token = await getToken();
    const amountCents = Math.round(parseFloat(amount) * 100);

    logger.info('moov_transfer_initiated', { amount, amountCents, sourceAccountId });

    try {
      const { data } = await axios.post(`${BASE_URL}/transfers`, {
        source:      { accountID: sourceAccountId || process.env.MOOV_ACCOUNT_ID },
        destination: { accountID: process.env.MOOV_ACCOUNT_ID },
        amount:      { value: amountCents, currency: 'USD' },
        description: description || 'Balanzify POS',
        metadata: { balanzify_reference: reference || '', ...meta },
      }, {
        headers: { Authorization: `Bearer ${token}`, 'X-Account-ID': process.env.MOOV_ACCOUNT_ID },
        timeout: 30000,
      });

      return {
        success:    true,
        provider:   'moov',
        reference:  data.transferID,
        amount:     parseFloat(amount),
        currency:   'USD',
        status:     data.status || 'pending',   // ACH: pending until settled (1-3 days)
        settlementDate: data.completedOn || null,
        note:       'ACH transfer initiated — typically settles in 1-3 business days',
        initiatedAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error('moov_transfer_failed', { message: err.message });
      throw Object.assign(
        new Error(`Moov transfer failed: ${err.response?.data?.error || err.message}`),
        { statusCode: 502, code: 'MOOV_TRANSFER_FAILED' }
      );
    }
  },

  async refund({ amount, originalReference, meta = {} }) {
    if (!process.env.MOOV_API_KEY) throw Object.assign(new Error('Moov not configured'), { statusCode: 503 });
    const token = await getToken();
    try {
      const { data } = await axios.post(`${BASE_URL}/transfers/${originalReference}/reversals`, {
        amount: { value: Math.round(parseFloat(amount) * 100), currency: 'USD' },
      }, {
        headers: { Authorization: `Bearer ${token}`, 'X-Account-ID': process.env.MOOV_ACCOUNT_ID },
        timeout: 30000,
      });
      return {
        success:   true,
        provider:  'moov',
        reference: data.transferID,
        amount:    parseFloat(amount),
        currency:  'USD',
        status:    data.status || 'pending',
      };
    } catch (err) {
      throw Object.assign(new Error(`Moov refund failed: ${err.message}`), { statusCode: 502 });
    }
  },

  async verify({ reference }) {
    if (!process.env.MOOV_API_KEY) return { verified: false, reference, status: 'unconfigured' };
    try {
      const token  = await getToken();
      const { data } = await axios.get(`${BASE_URL}/transfers/${reference}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Account-ID': process.env.MOOV_ACCOUNT_ID },
        timeout: 10000,
      });
      return {
        verified:  data.status === 'completed',
        reference,
        status:    data.status,
        amount:    data.amount?.value / 100,
        currency:  data.amount?.currency,
      };
    } catch (err) {
      return { verified: false, reference, status: 'unknown', error: err.message };
    }
  },

  async getStatus({ reference }) {
    const result = await this.verify({ reference });
    return { ...result, provider: 'moov' };
  },
};
