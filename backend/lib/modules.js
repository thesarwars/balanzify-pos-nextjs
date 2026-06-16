/**
 * Module Registry — Balanzify as a modular product family.
 *
 * Each module is defined as a SEPARATELY SELLABLE PRODUCT with its own
 * identity, route prefixes, and dependency graph. A business licenses the
 * modules it needs (Business.enabledModules). An empty enabledModules array
 * means ALL modules are enabled (legacy / full-suite customers).
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
    name: 'Balanzify Pharmacy',
    description: 'Pharmacy retail: drug catalog (generic name, strength, formulation), partial-pack/unit dispensing, expiry-loss prevention dashboard, fast-moving drug reorder.',
    standalone: true,                       // sold as its own product (bundles pos+inventory)
    requires: ['core', 'pos', 'inventory'],
    routes: ['/api/v1/pharmacy'],
  },

  hotel: {
    key: 'hotel',
    name: 'Balanzify Hotel',
    description: 'Property management: rooms, reservations, group bookings, folios, night audit, housekeeping, occupancy & RevPAR reporting.',
    standalone: true,
    requires: ['core', 'pos'],
    routes: ['/api/v1/hotel'],
  },

  restaurant: {
    key: 'restaurant',
    name: 'Balanzify Restaurant',
    description: 'Restaurant & café: tables, orders, kitchen display with station routing, modifiers, split bills, table reservations.',
    standalone: true,
    requires: ['core', 'pos'],
    routes: ['/api/v1/restaurant'],
  },

  credit: {
    key: 'credit',
    name: 'Balanzify Credit',
    description: 'Customer credit ledger, installment payment plans, WhatsApp statements & reminders, diaspora payment links.',
    standalone: false,                      // add-on: requires a selling module
    requires: ['core', 'pos'],
    routes: ['/api/v1/credit'],
  },

  insights: {
    key: 'insights',
    name: 'Balanzify Insights',
    description: 'AI business advisor: ask questions about your business in your own language, daily briefings.',
    standalone: false,
    requires: ['core', 'pos'],
    routes: ['/api/v1/insights'],
  },

  wholesale: {
    key: 'wholesale',
    name: 'Balanzify Wholesale',
    description: 'Distribution: B2B orders at wholesale prices, pick lists, driver dispatch, delivery tracking, collect-on-credit with outstanding balances per shop.',
    standalone: true,
    requires: ['core', 'inventory', 'credit'],
    routes: ['/api/v1/wholesale'],
  },

  construction: {
    key: 'construction',
    name: 'Balanzify Construction',
    description: 'Construction project management: job costing by category, daily labor log, site diary with photos for remote owners, milestone billing with retention, live budget-vs-actual.',
    standalone: true,
    requires: ['core', 'operations'],
    routes: ['/api/v1/construction'],
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
    name: 'HRM / Essentials',
    description: 'Staff management: employees, attendance, leave, shifts, advances, payroll & payslips.',
    standalone: false,
    requires: ['core'],
    routes: ['/api/v1/hrm'],
  },
};

/** Resolve the full set of enabled module keys for a business,
 *  expanding dependencies. Empty/null enabledModules = everything. */
function resolveEnabled(enabledModules) {
  if (!enabledModules || enabledModules.length === 0) {
    return new Set(Object.keys(MODULES)); // legacy: full suite
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

module.exports = { MODULES, resolveEnabled, moduleForPath };
