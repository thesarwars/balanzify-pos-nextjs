/**
 * Payment System Bootstrap
 *
 * Registers all payment providers with the registry.
 * Import this once in server.js — after that, use registry directly.
 *
 * To add a new payment method:
 *   1. Create lib/payments/providers/yourprovider.js
 *   2. Add registry.register('yourkey', require('./providers/yourprovider')) below
 *   3. Add YOURPROVIDER env vars to .env.example
 *   Done. No other files need to change.
 */

const registry = require('./registry');

// ── Always-on providers (no env vars required) ────────────────────────────────
registry.register('cash',   require('./providers/cash'));
registry.register('credit', require('./providers/credit'));

// ── Conditional providers (registered when env vars are present) ──────────────
// Zaad — Telesom mobile money (Somaliland)
// Works in manual_confirm mode without API keys; automated when ZAAD_API_URL is set
registry.register('zaad', require('./providers/zaad'));

// Manual-confirm mobile-money rails (no telco API needed — the cashier confirms
// the transfer at the counter). Covers the launch markets on day one; each can be
// upgraded to automated push/USSD later, per-rail, exactly like Zaad/M-Pesa.
const makeManualMobileMoney = require('./providers/_mobileMoneyManual');
registry.register('edahab',       makeManualMobileMoney({ key: 'edahab',   name: 'eDahab',            description: 'Somtel eDahab mobile money (Somaliland/Somalia)', currencies: ['USD', 'SOS'] }));
registry.register('evc',          makeManualMobileMoney({ key: 'evc',      name: 'EVC Plus',          description: 'Hormuud EVC Plus mobile money (Somalia)',         currencies: ['USD', 'SOS'] }));
registry.register('telebirr',     makeManualMobileMoney({ key: 'telebirr', name: 'telebirr',          description: 'Ethio Telecom telebirr (Ethiopia)',               currencies: ['ETB'] }));
registry.register('cbe_birr',     makeManualMobileMoney({ key: 'cbe_birr', name: 'CBE Birr',          description: 'Commercial Bank of Ethiopia CBE Birr (Ethiopia)', currencies: ['ETB'] }));
// Catch-all so a cashier is never blocked by a rail we haven't formally added.
registry.register('mobile_money', makeManualMobileMoney({ key: 'mobile_money', name: 'Mobile Money (other)', description: 'Generic mobile-money — cashier confirms the transfer', currencies: ['USD', 'SOS', 'KES', 'ETB'] }));

// M-Pesa — Safaricom (Kenya, Tanzania, Uganda, DRC, Mozambique, Egypt, Ghana, Ethiopia)
if (process.env.MPESA_CONSUMER_KEY) {
  registry.register('mpesa', require('./providers/mpesa'));
}

// Stripe — Card payments (Visa, Mastercard, Amex)
if (process.env.STRIPE_SECRET_KEY) {
  registry.register('stripe', require('./providers/stripe'));
}

// Moov — ACH bank transfers (US)
if (process.env.MOOV_API_KEY) {
  registry.register('moov', require('./providers/moov'));
}

// ── Add future providers here ─────────────────────────────────────────────────
// EVC Plus — Hormuud Telecom (Somalia)
// if (process.env.EVC_API_KEY) registry.register('evc', require('./providers/evc'));

// Airtel Money — Airtel Africa (Kenya, Uganda, Tanzania, Rwanda, Zambia, Madagascar, Congo, Malawi, Niger, Sierra Leone, Seychelles)
// if (process.env.AIRTEL_CLIENT_ID) registry.register('airtel', require('./providers/airtel'));

// MTN Mobile Money — (Ghana, Uganda, Cameroon, Ivory Coast, Zambia, South Africa, Rwanda, Benin)
// if (process.env.MTN_API_KEY) registry.register('mtn_momo', require('./providers/mtn_momo'));

// Square Terminal — for US hardware integration
// if (process.env.SQUARE_ACCESS_TOKEN) registry.register('square', require('./providers/square'));

// Flutterwave — pan-Africa card + mobile money aggregator
// if (process.env.FLW_SECRET_KEY) registry.register('flutterwave', require('./providers/flutterwave'));

module.exports = registry;
