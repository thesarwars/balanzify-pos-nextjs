/**
 * M-Pesa Payment Provider (Safaricom, Kenya/East Africa)
 *
 * Uses the official Safaricom Daraja API v2.
 * Supports: Lipa Na M-Pesa (STK Push) for customer-initiated payments.
 *
 * Required env vars:
 *   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET
 *   MPESA_SHORTCODE, MPESA_PASSKEY
 *   MPESA_CALLBACK_URL (must be HTTPS, publicly accessible)
 *   MPESA_ENV (sandbox | production)
 */

const { logger } = require('../../logger');
const axios = require('axios').default;

const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let _cachedToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
    timeout: 10000,
  });
  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + (parseInt(data.expires_in) - 60) * 1000;
  return _cachedToken;
}

module.exports = {
  name:            'M-Pesa',
  description:     'Safaricom M-Pesa mobile money (Kenya)',
  type:            'mobile_money',
  currencies:      ['KES'],
  requiresPhone:   true,
  requiresNetwork: true,
  requiresPin:     false,
  supportsRefund:  true,

  async charge({ amount, currency = 'KES', phone, description = 'Balanzify POS', reference, meta = {} }) {
    if (!process.env.MPESA_CONSUMER_KEY) {
      throw Object.assign(new Error('M-Pesa not configured. Set MPESA_CONSUMER_KEY in .env'), { statusCode: 503 });
    }
    if (!phone) throw Object.assign(new Error('Customer phone number required for M-Pesa'), { statusCode: 400 });

    const token    = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    // Normalize phone: 07XX → 2547XX
    const normalized = phone.replace(/^0/, '254').replace(/^\+/, '').replace(/\D/g, '');

    logger.info('mpesa_stk_push_initiated', { phone: normalized.slice(-4), amount });

    const { data } = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(parseFloat(amount)),  // M-Pesa requires integers
      PartyA:            normalized,
      PartyB:            process.env.MPESA_SHORTCODE,
      PhoneNumber:       normalized,
      CallBackURL:       process.env.MPESA_CALLBACK_URL,
      AccountReference:  reference || 'Balanzify',
      TransactionDesc:   description,
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    if (data.ResponseCode !== '0') {
      throw Object.assign(
        new Error(`M-Pesa STK push failed: ${data.ResponseDescription}`),
        { statusCode: 502, code: 'MPESA_STK_FAILED' }
      );
    }

    return {
      success:    true,
      provider:   'mpesa',
      reference:  data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      amount:     parseFloat(amount),
      currency:   'KES',
      phone:      normalized,
      status:     'pending',   // Pending until callback confirms
      note:       'STK push sent — awaiting customer PIN confirmation',
      initiatedAt: new Date().toISOString(),
    };
  },

  async refund({ amount, originalReference, meta = {} }) {
    if (!process.env.MPESA_CONSUMER_KEY) throw Object.assign(new Error('M-Pesa not configured'), { statusCode: 503 });
    const token = await getAccessToken();
    const { data } = await axios.post(`${BASE_URL}/mpesa/reversal/v1/request`, {
      Initiator:          process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
      CommandID:          'TransactionReversal',
      TransactionID:      originalReference,
      Amount:             Math.ceil(parseFloat(amount)),
      ReceiverParty:      process.env.MPESA_SHORTCODE,
      ResultURL:          process.env.MPESA_CALLBACK_URL,
      QueueTimeOutURL:    process.env.MPESA_CALLBACK_URL,
      Remarks:            'Refund via Balanzify',
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    return {
      success:   data.ResponseCode === '0',
      provider:  'mpesa',
      reference: data.OriginatorConversationID,
      amount:    parseFloat(amount),
      currency:  'KES',
      status:    data.ResponseCode === '0' ? 'pending' : 'failed',
      note:      data.ResponseDescription,
    };
  },

  async verify({ reference }) {
    // M-Pesa confirmation comes via webhook (MPESA_CALLBACK_URL)
    // This method polls the query API for payment status
    if (!process.env.MPESA_CONSUMER_KEY) return { verified: false, reference, status: 'unconfigured' };
    try {
      const token     = await getAccessToken();
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
      const { data }  = await axios.post(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        CheckoutRequestID: reference,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const completed = data.ResultCode === '0';
      return { verified: completed, reference, status: completed ? 'completed' : 'pending', rawResponse: data };
    } catch (err) {
      return { verified: false, reference, status: 'unknown', error: err.message };
    }
  },

  async getStatus({ reference }) {
    const result = await this.verify({ reference });
    return { ...result, provider: 'mpesa' };
  },
};
