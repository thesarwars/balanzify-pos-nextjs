/**
 * QR Payment Generator
 *
 * Generates payment QR codes for mobile money providers.
 * Each provider has its own format:
 *
 * M-Pesa (Kenya) — EMVCo QR standard
 *   Customer scans → M-Pesa app opens → amount pre-filled → customer confirms
 *   Confirmation via webhook (already built in payments/webhook/mpesa)
 *
 * Zaad (Somaliland) — Merchant till number + deep link
 *   Customer dials *881*TillNumber*Amount# or scans deep-link QR
 *   Confirmation via manual reference or automated when API available
 *
 * EVC Plus (Somalia/Hormuud) — Deep link QR
 *   Similar to Zaad — merchant number + amount
 *
 * Airtel Money / MTN MoMo — EMVCo QR where deployed
 *
 * The QR is displayed in the POS at the payment step.
 * The backend polls or receives webhook to confirm payment.
 */

const QRCode = require('qrcode');

/**
 * Generate QR code as a base64 PNG data URL
 * Ready to display in <img src="..." /> directly
 */
async function toDataUrl(text, options = {}) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    type:    'image/png',
    margin:  2,
    width:   options.width || 256,
    color: {
      dark:  options.dark  || '#000000',
      light: options.light || '#FFFFFF',
    },
  });
}

/**
 * M-Pesa EMVCo QR payload
 *
 * EMVCo format is a TLV (Tag-Length-Value) structure.
 * Safaricom's implementation follows the EMVCo Merchant QR spec.
 *
 * The generated QR, when scanned by M-Pesa app, opens a payment
 * screen with merchant name and amount pre-filled.
 *
 * Required env vars:
 *   MPESA_SHORTCODE      — business till/paybill number
 *   MPESA_MERCHANT_NAME  — displayed in M-Pesa app during payment
 *
 * @param {number} amount      — amount in KES (integer, M-Pesa doesn't support decimals)
 * @param {string} reference   — merchant reference (sale number)
 * @returns {Promise<{ qrDataUrl: string, payload: string }>}
 */
async function mpesaQR({ amount, reference, currency = 'KES' }) {
  const shortcode    = process.env.MPESA_SHORTCODE    || '';
  const merchantName = (process.env.MPESA_MERCHANT_NAME || 'Balanzify Merchant').slice(0, 25);
  const amountInt    = Math.ceil(parseFloat(amount)); // M-Pesa is integer KES

  if (!shortcode) {
    throw Object.assign(
      new Error('M-Pesa QR requires MPESA_SHORTCODE in .env'),
      { statusCode: 503, code: 'MPESA_NOT_CONFIGURED' }
    );
  }

  // EMVCo QR payload construction
  // Reference: https://developer.safaricom.co.ke/APIs/DynamicMPesaQR
  // Format: Tag(2) + Length(2) + Value
  const buildTLV = (tag, value) => {
    const v = String(value);
    return `${tag}${String(v.length).padStart(2, '0')}${v}`;
  };

  // EMVCo tags
  const payload = [
    buildTLV('00', '01'),                               // Payload format indicator
    buildTLV('01', '12'),                               // Point of initiation (12=dynamic)
    '26' + (() => {                                     // Merchant account info
      const sub = buildTLV('00', 'com.safaricom.mpesa') + buildTLV('01', shortcode);
      return String(sub.length).padStart(2, '0') + sub;
    })(),
    buildTLV('52', '0000'),                             // Merchant category code
    buildTLV('53', '404'),                              // Currency (404=KES)
    buildTLV('54', String(amountInt)),                  // Transaction amount
    buildTLV('58', 'KE'),                               // Country code
    buildTLV('59', merchantName),                       // Merchant name
    buildTLV('60', 'NAIROBI'),                          // Merchant city
    buildTLV('62', buildTLV('05', (reference || 'REF').slice(0, 25))), // Reference
  ].join('');

  // CRC (required by EMVCo spec)
  const withCrcTag = payload + '6304';
  const crc = crc16(withCrcTag).toString(16).toUpperCase().padStart(4, '0');
  const finalPayload = withCrcTag + crc;

  const qrDataUrl = await toDataUrl(finalPayload, { width: 280 });
  return { qrDataUrl, payload: finalPayload, provider: 'mpesa', amount: amountInt, currency: 'KES' };
}

/**
 * CRC-16/CCITT-FALSE — required for EMVCo QR CRC
 */
function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc;
}

/**
 * Zaad (Telesom, Somaliland) QR
 *
 * Zaad uses a USSD-based system. The QR encodes a deep link
 * that opens the Zaad app (if installed) or shows the USSD string.
 *
 * USSD format: *881*{merchantTill}*{amount}#
 * Deep link:   zaad://pay?till={till}&amount={amount}&ref={ref}
 *
 * Required env vars:
 *   ZAAD_MERCHANT_TILL   — merchant till number
 *   ZAAD_MERCHANT_NAME   — displayed in QR
 */
async function zaadQR({ amount, reference, currency = 'USD' }) {
  const till         = process.env.ZAAD_MERCHANT_TILL || process.env.ZAAD_MERCHANT_ID || '';
  const merchantName = process.env.ZAAD_MERCHANT_NAME || 'Merchant';

  if (!till) {
    throw Object.assign(
      new Error('Zaad QR requires ZAAD_MERCHANT_TILL in .env'),
      { statusCode: 503, code: 'ZAAD_NOT_CONFIGURED' }
    );
  }

  const amountFormatted = parseFloat(amount).toFixed(2);

  // Deep link — opens Zaad app if installed
  const deepLink = `zaad://pay?till=${encodeURIComponent(till)}&amount=${encodeURIComponent(amountFormatted)}&ref=${encodeURIComponent(reference || '')}&merchant=${encodeURIComponent(merchantName)}`;

  // USSD fallback — works on any phone
  const ussd = `*881*${till}*${amountFormatted}#`;

  // QR encodes the deep link (Zaad app scans it)
  const qrDataUrl = await toDataUrl(deepLink, { width: 280, dark: '#003366' });

  return {
    qrDataUrl,
    payload:     deepLink,
    ussd,        // Show this as text for customers who can't scan
    provider:    'zaad',
    amount:      parseFloat(amountFormatted),
    currency,
    merchantTill: till,
    instructions: `Scan with Zaad app, or dial ${ussd}`,
  };
}

/**
 * EVC Plus (Hormuud, Somalia) QR
 *
 * Similar to Zaad — deep link + USSD fallback
 * USSD: *712*{merchantCode}*{amount}#
 *
 * Required env vars:
 *   EVC_MERCHANT_CODE
 */
async function evcQR({ amount, reference, currency = 'USD' }) {
  const code         = process.env.EVC_MERCHANT_CODE || '';
  const merchantName = process.env.EVC_MERCHANT_NAME || 'Merchant';

  if (!code) {
    throw Object.assign(
      new Error('EVC QR requires EVC_MERCHANT_CODE in .env'),
      { statusCode: 503, code: 'EVC_NOT_CONFIGURED' }
    );
  }

  const amountFormatted = parseFloat(amount).toFixed(2);
  const deepLink = `evcplus://pay?code=${encodeURIComponent(code)}&amount=${encodeURIComponent(amountFormatted)}&ref=${encodeURIComponent(reference || '')}`;
  const ussd = `*712*${code}*${amountFormatted}#`;

  const qrDataUrl = await toDataUrl(deepLink, { width: 280, dark: '#1B5E20' });

  return {
    qrDataUrl,
    payload:     deepLink,
    ussd,
    provider:    'evc',
    amount:      parseFloat(amountFormatted),
    currency,
    merchantCode: code,
    instructions: `Scan with EVC Plus app, or dial ${ussd}`,
  };
}

/**
 * Generic QR for any provider not natively supported.
 * Encodes a payment URL or identifier as a plain QR.
 */
async function genericQR({ amount, currency, reference, merchantName, payload }) {
  const text = payload || `PAY:${merchantName}:${currency}${parseFloat(amount).toFixed(2)}:${reference}`;
  const qrDataUrl = await toDataUrl(text, { width: 280 });
  return { qrDataUrl, payload: text, provider: 'generic', amount: parseFloat(amount), currency };
}

/**
 * Main entry point — generate QR for a specific provider
 * Called by the /api/v1/payments/qr endpoint
 */
async function generatePaymentQR({ provider, amount, currency, reference, merchantName }) {
  switch (provider) {
    case 'mpesa':   return mpesaQR({ amount, reference, currency });
    case 'zaad':    return zaadQR({ amount, reference, currency });
    case 'evc':
    case 'evcplus': return evcQR({ amount, reference, currency });
    default:        return genericQR({ amount, currency, reference, merchantName });
  }
}

module.exports = { generatePaymentQR, mpesaQR, zaadQR, evcQR, toDataUrl, crc16 };
