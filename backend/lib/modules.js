/**
 * Module Registry — Balanzify as a modular product family.
 *
 * Each module is defined as a SEPARATELY SELLABLE PRODUCT with its own
 * identity, route prefixes, and dependency graph. A business licenses the
 * modules it needs (Business.enabledModules). An empty enabledModules array
 * means the base plan is on (core + pos + inventory + operations); add-on and
 * vertical modules (default: false) stay off until explicitly enabled.
 *
 * This is the foundation for selling, e.g.:
 *   - "Balanzify POS"        (pos + inventory-lite)   to a small shop
 *   - "Balanzify Pharmacy"   (pharmacy + pos + inventory) to a chemist
 *   - "Balanzify Hotel"      (hotel + pos)            to a guesthouse
 *   - "Balanzify Restaurant" (restaurant + pos)       to a café
 *   - "Balanzify Credit"     (credit add-on)          on top of any of them
 *
 * Pricing metadata here is descriptive (for the UI/sales tooling), the
 * billing system is the source of truth for actual charges.
 */

const MODULES = {
  core: {
    key: 'core',
    name: 'Core',
    description: 'Authentication, users, business settings, notifications. Always on.',
    alwaysOn: true,
    routes: ['/api/v1/auth', '/api/v1/users', '/api/v1/settings', '/api/v1/notifications', '/api/v1/upload'],
  },

  pos: {
    key: 'pos',
    name: 'Balanzify POS',
    description: 'Point of sale: ring up sales, take payment (cash, Zaad, EVC, M-Pesa, Telebirr), receipts, refunds, shifts.',
    standalone: true,                       // sellable on its own
    requires: ['core'],
    includesLite: ['inventory'],            // POS ships with basic product/stock management
    routes: ['/api/v1/sales', '/api/v1/checkout', '/api/v1/payments', '/api/v1/customers', '/api/v1/coupons', '/api/v1/loyalty', '/api/v1/tax'],
  },

  inventory: {
    key: 'inventory',
    name: 'Balanzify Inventory',
    description: 'Full inventory: batches & expiry, FIFO costing, transfers, stocktakes, purchase orders, suppliers, reorder suggestions.',
    standalone: true,
    requires: ['core'],
    routes: ['/api/v1/products', '/api/v1/stock', '/api/v1/stocktake', '/api/v1/purchase-orders', '/api/v1/suppliers', '/api/v1/categories', '/api/v1/locations', '/api/v1/labels', '/api/v1/bundles'],
  },

  pharmacy: {
    key: 'pharmacy',
    default: false,
    name: 'Balanzify Pharmacy',
    description: 'Pharmacy retail: drug catalog (generic name, strength, formulation), partial-pack/unit dispensing, expiry-loss prevention dashboard, fast-moving drug reorder.',
    standalone: true,                       // sold as its own product (bundles pos+inventory)
    requires: ['core', 'pos', 'inventory'],
    routes: ['/api/v1/pharmacy'],
  },

  hotel: {
    key: 'hotel',
    default: false,
    name: 'Balanzify Hotel',
    description: 'Property management: rooms, reservations, group bookings, folios, night audit, housekeeping, occupancy & RevPAR reporting.',
    standalone: true,
    requires: ['core', 'pos'],
    routes: ['/api/v1/hotel'],
  },

  restaurant: {
    key: 'restaurant',
    default: false,
    name: 'Balanzify Restaurant & Café',
    description: 'Restaurant & café: tables, orders, kitchen/bar display with station routing, modifiers, combos, split bills (incl. by seat), reservations. One-tap coffee-shop quick start.',
    standalone: true,
    requires: ['core', 'pos'],
    routes: ['/api/v1/restaurant'],
  },

  credit: {
    key: 'credit',
    default: false,
    name: 'Balanzify Credit',
    description: 'Customer credit ledger, installment payment plans, WhatsApp statements & reminders, diaspora payment links.',
    standalone: false,                      // add-on: requires a selling module
    requires: ['core', 'pos'],
    routes: ['/api/v1/credit'],
  },

  savings: {
    key: 'savings',
    default: false,
    name: 'Balanzify Savings Circles',
    description: 'Digitize hagbad / ayuuto / chama rotating savings groups: members, contribution tracking, rotation schedule, payouts, mobile-money collection. Free — the value is the relationship + contribution history.',
    standalone: false,                      // free add-on
    requires: ['core'],
    routes: ['/api/v1/savings'],
  },

  insights: {
    key: 'insights',
    default: false,
    name: 'Balanzify Insights',
    description: 'AI business advisor: ask questions about your business in your own language, daily briefings.',
    standalone: false,
    requires: ['core', 'pos'],
    routes: ['/api/v1/insights'],
  },

  wholesale: {
    key: 'wholesale',
    default: false,
    name: 'Balanzify Wholesale',
    description: 'Distribution: B2B orders at wholesale prices, pick lists, driver dispatch, delivery tracking, collect-on-credit with outstanding balances per shop.',
    standalone: true,
    requires: ['core', 'inventory', 'credit'],
    routes: ['/api/v1/wholesale'],
  },

  construction: {
    key: 'construction',
    default: false,
    name: 'Balanzify Construction',
    description: 'Construction project management: job costing by category, daily labor log, site diary with photos for remote owners, milestone billing with retention, live budget-vs-actual.',
    standalone: true,
    requires: ['core', 'operations'],
    routes: ['/api/v1/construction'],
  },

  delivery: {
    key: 'delivery',
    default: false,
    name: 'Balanzify Delivery',
    description: 'Consumer ordering + driver dispatch: take delivery orders (WhatsApp/web/POS), auto-match an available driver, track pickup→delivery, and post the delivery fee to the ledger. Built on the merchants and catalogs already on the platform.',
    standalone: false,
    requires: ['core', 'pos'],
    routes: ['/api/v1/delivery'],
  },

  operations: {
    key: 'operations',
    name: 'Balanzify Operations',
    description: 'Back office: reports, exports, scheduled reports, petty cash, projects & tasks, webhooks, currency.',
    standalone: false,
    requires: ['core'],
    routes: ['/api/v1/reports', '/api/v1/export', '/api/v1/scheduled-reports', '/api/v1/petty-cash', '/api/v1/projects', '/api/v1/tasks', '/api/v1/webhooks', '/api/v1/currency', '/api/v1/customer-segments', '/api/v1/whatsapp'],
  },

  hrm: {
    key: 'hrm',
    default: false,
    name: 'HRM / Essentials',
    description: 'Staff management: employees, attendance, leave, shifts, advances, payroll & payslips.',
    standalone: false,
    requires: ['core'],
    routes: ['/api/v1/hrm'],
  },

  superadmin: {
    key: 'superadmin',
    name: 'Superadmin (SaaS)',
    description: 'Platform console: subscription packages, all businesses, payments, gateways.',
    standalone: true,
    default: false, // opt-in only — NOT part of the legacy full-suite default
    requires: ['core'],
    routes: ['/api/v1/superadmin'],
  },
};

// Monthly price (USD) for each paid add-on — authoritative source for billing.
const MODULE_PRICES = {
  pharmacy: 15, hotel: 25, restaurant: 19, credit: 9, insights: 12,
  wholesale: 14, construction: 22, hrm: 18, superadmin: 39, delivery: 12, savings: 0,
};
const modulePrice = (key) => MODULE_PRICES[key] || 0;

/** Resolve the full set of enabled module keys for a business, expanding
 *  dependencies. Empty/null enabledModules = the base plan (default modules). */
function resolveEnabled(enabledModules) {
  if (!enabledModules || enabledModules.length === 0) {
    // legacy: full suite — but opt-in modules (default: false) stay off
    return new Set(Object.keys(MODULES).filter(k => MODULES[k].default !== false));
  }
  const resolved = new Set(['core']);
  const add = (key) => {
    const mod = MODULES[key];
    if (!mod || resolved.has(key)) return;
    resolved.add(key);
    (mod.requires || []).forEach(add);
    (mod.includesLite || []).forEach(add);
  };
  enabledModules.forEach(add);
  return resolved;
}

/** Which module owns a given API path (longest-prefix match). */
function moduleForPath(path) {
  let best = null, bestLen = -1;
  for (const mod of Object.values(MODULES)) {
    for (const prefix of mod.routes || []) {
      if (path.startsWith(prefix) && prefix.length > bestLen) {
        best = mod.key; bestLen = prefix.length;
      }
    }
  }
  return best;
}

module.exports = { MODULES, MODULE_PRICES, modulePrice, resolveEnabled, moduleForPath };
