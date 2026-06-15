/**
 * Market Profiles — how Balanzify fits each African market.
 *
 * One product, one codebase, market-specific configuration. Each profile
 * drives: currencies, languages, payment rails, tax-compliance hooks, and
 * which module bundle leads the go-to-market in that country.
 *
 * Built from market research (2026):
 *  - Somaliland: ZAAD (Telesom) + eDahab dominant; own monetary system
 *    (Bank of Somaliland, Mojaloop NPS); no enforced e-invoicing; USD + SLSH.
 *  - Somalia: EVC Plus (Hormuud) dominant; USD + SOS; federal framework.
 *  - Kenya: M-Pesa dominant (30M+ users); KRA eTIMS e-invoicing is MANDATORY
 *    ("No eTIMS, No Expense", enforced Jan 2026) — compliance hook required;
 *    NHIF→SHA insurance integration matters for pharmacy; KES.
 *  - Ethiopia: Telebirr (Ethio Telecom) + M-Pesa entering + Chapa/ArifPay
 *    gateways; ETB with currency controls; Amharic essential; EFDA pharmacy
 *    rules exist but enforcement is weak — partial-pack dispensing is the
 *    documented norm (~83% of outlets dispense partial regimens).
 *
 * A new market = a new profile object + any new payment provider file.
 * Nothing else in the codebase changes. That is the expansion playbook
 * encoded: general foundation, market-specific surface.
 */

const MARKETS = {
  somaliland: {
    key: 'somaliland',
    name: 'Somaliland',
    currencies: ['USD', 'SLSH'],
    defaultCurrency: 'USD',
    languages: ['so', 'en', 'ar'],
    defaultLanguage: 'so',
    paymentRails: ['zaad', 'edahab', 'cash', 'credit'],
    primaryRail: 'zaad',
    taxCompliance: {
      type: 'gst',
      rate: 0.025, // 2.5% — Ministry of Finance reform announced 7 Jun 2026 (rate halved from 5%, base broadened, digital collection)
      notes: 'GST 2.5% flat rate on sales. MoF reform Jun 2026: 5%->2.5%, broadened base, digital collection.',
    },
    pharmacyCompliance: { prescriptionEnforced: false, partialPackCommon: true, notes: 'Lead with expiry-loss prevention, not compliance.' },
    leadBundle: ['pos', 'inventory', 'credit'],
    notes: 'Beachhead. Moat = community trust + Telesom/Premier Bank relationships. Mojaloop NPS (2026) enables future interop.',
  },

  somalia: {
    key: 'somalia',
    name: 'Somalia',
    currencies: ['USD', 'SOS'],
    defaultCurrency: 'USD',
    languages: ['so', 'en', 'ar'],
    defaultLanguage: 'so',
    paymentRails: ['evc', 'edahab', 'cash', 'credit'],
    primaryRail: 'evc',
    taxCompliance: { type: 'none', notes: 'Federal framework; Somali Payment Switch under SPS — monitor.' },
    pharmacyCompliance: { prescriptionEnforced: false, partialPackCommon: true },
    leadBundle: ['pos', 'inventory', 'credit'],
    notes: 'Second market. Shared language/diaspora; Hormuud relationship mirrors Telesom play.',
  },

  kenya: {
    key: 'kenya',
    name: 'Kenya',
    currencies: ['KES', 'USD'],
    defaultCurrency: 'KES',
    languages: ['sw', 'en'],
    defaultLanguage: 'en',
    paymentRails: ['mpesa', 'cash', 'card', 'credit'],
    primaryRail: 'mpesa',
    taxCompliance: {
      type: 'etims',
      mandatory: true,
      notes: 'KRA eTIMS e-invoicing MANDATORY (enforced Jan 2026). Every sale must transmit a compliant e-invoice (OSCU online / VSCU virtual unit). Integration required BEFORE Kenya launch — this is a hard gate, not a feature.',
    },
    pharmacyCompliance: { prescriptionEnforced: true, partialPackCommon: true, insurance: 'NHIF→SHA claims integration valuable for pharmacy vertical.' },
    leadBundle: ['pharmacy', 'pos', 'inventory'],
    notes: 'Hardest market: UZAPOINT home turf, most crowded. Enter via pharmacy vertical (less contested than generic POS) and only after eTIMS hook is built.',
  },

  ethiopia: {
    key: 'ethiopia',
    name: 'Ethiopia',
    currencies: ['ETB'],
    defaultCurrency: 'ETB',
    languages: ['am', 'en'],
    defaultLanguage: 'am',
    paymentRails: ['telebirr', 'mpesa', 'chapa', 'cash', 'credit'],
    primaryRail: 'telebirr',
    taxCompliance: { type: 'erca', mandatory: false, notes: 'Fiscal receipt rules for formal businesses; verify per-segment before launch. Currency controls restrict FX.' },
    pharmacyCompliance: { prescriptionEnforced: false, partialPackCommon: true, notes: 'EFDA rules exist, enforcement weak; ~83% of outlets dispense partial packs — unit selling is essential, expiry visibility is the value lead.' },
    leadBundle: ['pharmacy', 'pos', 'inventory'],
    notes: 'Highest barrier (regulatory, currency, state control). Last in sequence. Amharic UI is non-negotiable.',
  },
};

function getMarket(key) {
  return MARKETS[key] || MARKETS.somaliland;
}

module.exports = { MARKETS, getMarket };
