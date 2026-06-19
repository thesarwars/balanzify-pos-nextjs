// ═══════════════════════════════════════════════════════════════════
//  API CLIENT LAYER  —  single source of truth for all server I/O.
//  Speaks the UltimatePOS  /connector/api  contract, exactly.
//
//  TODAY (mode: 'mock')  → served by the in-file mock backend below,
//  backed by a persistent localStorage ledger (browser only).
//  BACKEND DAY (mode: 'live') → set API_CONFIG.baseUrl + flip mode.
//
//  Ported from the prototype's window.API (app/api.jsx). Self-contained:
//  declares its own mock data (PRODUCTS, CATEGORIES, SALES, PAYMENT_METHODS).
//  All localStorage access is guarded for Next.js SSR.
// ═══════════════════════════════════════════════════════════════════

// ── SSR-safe localStorage helpers ───────────────────────────────────
const hasWindow = (): boolean => typeof window !== 'undefined';
function lsGet(key: string): string | null { return hasWindow() ? window.localStorage.getItem(key) : null; }
function lsSet(key: string, val: string): void { if (hasWindow()) window.localStorage.setItem(key, val); }

// ── Self-contained mock data (from the prototype's data.jsx) ─────────
const PAYMENT_METHODS: any[] = [
  { id: 'cash', label: 'Cash',     icon: '◎', hint: 'Notes & coins' },
  { id: 'zaad', label: 'Zaad',     icon: '◈', hint: 'Mobile money' },
  { id: 'evc',  label: 'EVC Plus', icon: '◆', hint: 'Mobile money' },
  { id: 'card', label: 'Card',     icon: '▭', hint: 'Visa / Master' },
];

const CATEGORIES: any[] = [
  { id: 'all',     name: 'All Items',   icon: '▦', count: 0 },
  { id: 'drinks',  name: 'Drinks',      icon: '◉', count: 0, color: '#7FB7D6', desc: 'Teas, water, soft & energy drinks.' },
  { id: 'grocery', name: 'Grocery',     icon: '◫', count: 0, color: '#D9A441', desc: 'Staples — rice, oil, flour, sugar, pasta.' },
  { id: 'bakery',  name: 'Bakery',      icon: '◓', count: 0, color: '#C58A4A', desc: 'Fresh bread, sambusa, anjero, cookies.' },
  { id: 'dairy',   name: 'Dairy',       icon: '◐', count: 0, color: '#5B8A4C', desc: 'Milk, yogurt, butter and cheese.' },
  { id: 'home',    name: 'Home Care',   icon: '☖', count: 0, color: '#6E9FC9', desc: 'Soap, detergent, tissue and cleaning.' },
  { id: 'pharmacy',name: 'Pharmacy',    icon: '✚', count: 0, color: '#C0504D', desc: 'Over-the-counter and prescription items.' },
  { id: 'snacks',  name: 'Snacks',      icon: '◆', count: 0, color: '#B5793F', desc: 'Chips, biscuits, peanuts and chocolate.' },
];

const PRODUCTS: any[] = [
  // drinks
  { id: 'p01', name: 'Somali Tea (Shaah)', cat: 'drinks', sku: 'DRK-001', price: 1.50, cost: 0.60, stock: 84, unit: 'cup', sw: '#E7B85C' },
  { id: 'p02', name: 'Bottled Water 1.5L', cat: 'drinks', sku: 'DRK-014', price: 0.75, cost: 0.30, stock: 240, unit: 'btl', sw: '#7FB7D6' },
  { id: 'p03', name: 'Cola 500ml', cat: 'drinks', sku: 'DRK-021', price: 1.20, cost: 0.55, stock: 156, unit: 'btl', sw: '#C0504D' },
  { id: 'p04', name: 'Mango Juice 1L', cat: 'drinks', sku: 'DRK-033', price: 2.40, cost: 1.10, stock: 48, unit: 'box', sw: '#E89B3B' },
  { id: 'p05', name: 'Energy Drink', cat: 'drinks', sku: 'DRK-040', price: 1.80, cost: 0.90, stock: 12, unit: 'can', sw: '#5B8A4C' },
  // grocery
  { id: 'p06', name: 'Basmati Rice 5kg', cat: 'grocery', sku: 'GRC-002', price: 8.90, cost: 6.20, stock: 36, unit: 'bag', sw: '#D9C9A3' },
  { id: 'p07', name: 'Cooking Oil 3L', cat: 'grocery', sku: 'GRC-008', price: 6.50, cost: 4.80, stock: 28, unit: 'btl', sw: '#E3C84B' },
  { id: 'p08', name: 'Pasta 500g', cat: 'grocery', sku: 'GRC-012', price: 1.10, cost: 0.55, stock: 92, unit: 'pkt', sw: '#E0B66A' },
  { id: 'p09', name: 'White Sugar 1kg', cat: 'grocery', sku: 'GRC-019', price: 1.40, cost: 0.95, stock: 64, unit: 'kg', sw: '#EDE6DA' },
  { id: 'p10', name: 'Wheat Flour 2kg', cat: 'grocery', sku: 'GRC-023', price: 2.20, cost: 1.45, stock: 41, unit: 'bag', sw: '#E8DCC2' },
  { id: 'p11', name: 'Tomato Paste', cat: 'grocery', sku: 'GRC-031', price: 0.90, cost: 0.40, stock: 110, unit: 'can', sw: '#C0504D' },
  { id: 'p12', name: 'Black Tea Loose 250g', cat: 'grocery', sku: 'GRC-037', price: 3.10, cost: 2.00, stock: 22, unit: 'box', sw: '#8A5A2B' },
  // bakery
  { id: 'p13', name: 'Fresh Sambusa', cat: 'bakery', sku: 'BKY-001', price: 0.50, cost: 0.20, stock: 60, unit: 'pc', sw: '#D99C5B' },
  { id: 'p14', name: 'Anjero (5 pack)', cat: 'bakery', sku: 'BKY-004', price: 1.75, cost: 0.80, stock: 30, unit: 'pack', sw: '#E2C18A' },
  { id: 'p15', name: 'White Bread Loaf', cat: 'bakery', sku: 'BKY-009', price: 1.00, cost: 0.45, stock: 26, unit: 'loaf', sw: '#E8D6AE' },
  { id: 'p16', name: 'Date Cookies 200g', cat: 'bakery', sku: 'BKY-013', price: 2.30, cost: 1.20, stock: 18, unit: 'box', sw: '#B5793F' },
  // dairy
  { id: 'p17', name: 'Fresh Milk 1L', cat: 'dairy', sku: 'DRY-002', price: 1.30, cost: 0.85, stock: 54, unit: 'btl', sw: '#EDEAE2' },
  { id: 'p18', name: 'Yogurt Cup', cat: 'dairy', sku: 'DRY-006', price: 0.85, cost: 0.40, stock: 72, unit: 'cup', sw: '#E7E0CE' },
  { id: 'p19', name: 'Butter 250g', cat: 'dairy', sku: 'DRY-011', price: 2.80, cost: 1.90, stock: 16, unit: 'pkt', sw: '#E9CF6E' },
  { id: 'p20', name: 'White Cheese 400g', cat: 'dairy', sku: 'DRY-015', price: 4.20, cost: 2.90, stock: 9, unit: 'pkt', sw: '#EDE6D2' },
  // home care
  { id: 'p21', name: 'Hand Soap', cat: 'home', sku: 'HOM-003', price: 1.10, cost: 0.50, stock: 88, unit: 'bar', sw: '#9AC0CB' },
  { id: 'p22', name: 'Laundry Powder 1kg', cat: 'home', sku: 'HOM-007', price: 3.40, cost: 2.20, stock: 33, unit: 'box', sw: '#7CA6D6' },
  { id: 'p23', name: 'Dish Liquid 500ml', cat: 'home', sku: 'HOM-012', price: 1.90, cost: 1.00, stock: 47, unit: 'btl', sw: '#6FB89A' },
  { id: 'p24', name: 'Tissue 4-roll', cat: 'home', sku: 'HOM-018', price: 2.10, cost: 1.20, stock: 51, unit: 'pack', sw: '#E4DCCB' },
  // pharmacy
  { id: 'p25', name: 'Paracetamol 500mg', cat: 'pharmacy', sku: 'PHM-001', price: 0.95, cost: 0.35, stock: 130, unit: 'strip', sw: '#9CC4E0', rx: true },
  { id: 'p26', name: 'ORS Sachets (10)', cat: 'pharmacy', sku: 'PHM-005', price: 1.60, cost: 0.70, stock: 64, unit: 'box', sw: '#8FBF8A', rx: true },
  { id: 'p27', name: 'Vitamin C 1000mg', cat: 'pharmacy', sku: 'PHM-009', price: 3.50, cost: 2.10, stock: 25, unit: 'tube', sw: '#E6A93B', rx: true },
  { id: 'p28', name: 'Antiseptic 100ml', cat: 'pharmacy', sku: 'PHM-014', price: 2.20, cost: 1.30, stock: 7, unit: 'btl', sw: '#C99AC4', rx: true },
  // snacks
  { id: 'p29', name: 'Potato Chips', cat: 'snacks', sku: 'SNK-002', price: 0.80, cost: 0.35, stock: 140, unit: 'pkt', sw: '#E3B84F' },
  { id: 'p30', name: 'Biscuits Family Pack', cat: 'snacks', sku: 'SNK-006', price: 1.95, cost: 1.00, stock: 58, unit: 'pack', sw: '#D49A55' },
  { id: 'p31', name: 'Roasted Peanuts 200g', cat: 'snacks', sku: 'SNK-010', price: 1.40, cost: 0.70, stock: 44, unit: 'bag', sw: '#C28A4A' },
  { id: 'p32', name: 'Chocolate Bar', cat: 'snacks', sku: 'SNK-015', price: 1.25, cost: 0.60, stock: 96, unit: 'bar', sw: '#7A4A2B' },
];

// fill category counts
CATEGORIES.forEach((c: any) => { c.count = c.id === 'all' ? PRODUCTS.length : PRODUCTS.filter((p: any) => p.cat === c.id).length; });

// Recent sales for Dashboard + Sales screen
const NAMES: string[] = ['Walk-in', 'Khadija Ali', 'Mohamed Farah', 'Walk-in', 'Ifrah Abdi', 'Walk-in', 'Yusuf Omar', 'Hodan Said', 'Walk-in', 'Abdirahman N.', 'Walk-in', 'Sahra Jama'];
const SALES: any[] = Array.from({ length: 12 }).map((_, i) => {
  const pm = PAYMENT_METHODS[i % PAYMENT_METHODS.length];
  const total = +(2 + Math.random() * 46).toFixed(2);
  const items = 1 + Math.floor(Math.random() * 7);
  return {
    id: 'SL-' + String(1042 - i).padStart(5, '0'),
    customer: NAMES[i],
    cashier: i % 3 === 0 ? 'Amina Y.' : i % 3 === 1 ? 'Bashir M.' : 'Nimco H.',
    method: pm.id, methodLabel: pm.label,
    items, total,
    minsAgo: Math.round(i * 7.5 + Math.random() * 5),
    status: i === 4 ? 'refunded' : i === 9 ? 'held' : 'completed',
  };
});

// ── Configuration (persisted) ───────────────────────────────────────
const API_CONFIG: any = (() => {
  let saved: any = {};
  try { saved = JSON.parse(lsGet('bz_api_cfg') || '{}'); } catch (e) {}
  return {
    mode:    saved.mode    || 'mock',   // 'mock' | 'live'
    baseUrl: saved.baseUrl || '',       // e.g. https://pos.yourdomain.com
    latency: saved.latency ?? 260,      // simulated network delay (mock only)
    token:   saved.token   || null,     // OAuth2 bearer access token
  };
})();
function persistApiCfg() {
  lsSet('bz_api_cfg', JSON.stringify(API_CONFIG));
}

// ── Request log (drives the API dev panel) ──────────────────────────
const API_LOG: any[] = [];
function pushLog(entry: any) {
  API_LOG.unshift(entry);
  if (API_LOG.length > 40) API_LOG.pop();
  if (hasWindow()) window.dispatchEvent(new CustomEvent('bz-api-log', { detail: entry }));
}

class ApiError extends Error {
  status: number; body: any;
  constructor(status: number, message?: string, body?: any) { super(message); this.status = status; this.body = body; }
}

// ── Core transport: live fetch  OR  mock router ─────────────────────
async function transport(method: string, path: string, { query, body, auth = true }: any = {}): Promise<any> {
  const qs = query ? '?' + Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as any)}`).join('&') : '';
  const started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const stamp = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);

  // ── LIVE ──────────────────────────────────────────────────────────
  if (API_CONFIG.mode === 'live') {
    const base = API_CONFIG.baseUrl.replace(/\/$/, '');
    const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (auth && API_CONFIG.token) headers.Authorization = 'Bearer ' + API_CONFIG.token;
    let res: any, json: any;
    try {
      res = await fetch(base + path + qs, { method, headers, body: body ? JSON.stringify(body) : undefined });
      json = await res.json().catch(() => ({}));
    } catch (err) {
      pushLog({ t: Date.now(), mode: 'live', method, path: path + qs, status: 0, ms: stamp(), ok: false });
      throw new ApiError(0, 'Network error — is the backend reachable at ' + base + '?', null);
    }
    pushLog({ t: Date.now(), mode: 'live', method, path: path + qs, status: res.status, ms: stamp(), ok: res.ok });
    if (!res.ok) throw new ApiError(res.status, (json && json.message) || ('HTTP ' + res.status), json);
    return json;
  }

  // ── MOCK ──────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, API_CONFIG.latency));
  const route = MOCK_ROUTES.find((r: any) => r.method === method && r.test(path));
  let status = 200, json: any;
  try {
    if (!route) throw new ApiError(404, 'No mock handler for ' + method + ' ' + path);
    json = route.handler({ path, query: query || {}, body: body || {}, params: route.params(path) });
  } catch (err: any) {
    status = err.status || 500;
    pushLog({ t: Date.now(), mode: 'mock', method, path: path + qs, status, ms: stamp(), ok: false });
    throw err;
  }
  pushLog({ t: Date.now(), mode: 'mock', method, path: path + qs, status, ms: stamp(), ok: true });
  return json;
}

// ═══════════════════════════════════════════════════════════════════
//  REAL BACKEND  (/api/v1)  —  active when NEXT_PUBLIC_API_MODE === 'real'.
//  Same-origin by default (the outer nginx proxies /api/v1 → api:5000);
//  set NEXT_PUBLIC_BACKEND_URL for local dev against a separately-run API.
//  JWT access/refresh tokens live in localStorage and ride as a Bearer header.
//  Backend error shape is RFC-7807-ish: { title, status, detail, errors }.
// ═══════════════════════════════════════════════════════════════════
const REAL_MODE: boolean = (typeof process !== 'undefined' && !!process.env && process.env.NEXT_PUBLIC_API_MODE === 'real');
const BACKEND_BASE: string = ((typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BACKEND_URL) || '').replace(/\/$/, '');
const ACCESS_KEY = 'bz_access_token', REFRESH_KEY = 'bz_refresh_token';
function getAccessToken(): string | null { return lsGet(ACCESS_KEY); }
function setTokens(access?: string | null, refresh?: string | null): void {
  if (access) lsSet(ACCESS_KEY, access);
  if (refresh) lsSet(REFRESH_KEY, refresh);
}
function clearTokens(): void { if (hasWindow()) { window.localStorage.removeItem(ACCESS_KEY); window.localStorage.removeItem(REFRESH_KEY); } }

async function realReq(method: string, path: string, { query, body, auth = true, bearer }: any = {}): Promise<any> {
  const qs = query ? '?' + Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as any)}`).join('&') : '';
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const tok = getAccessToken();
  // `bearer` overrides the stored token for one call (e.g. the MFA pre-auth token).
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  else if (auth && tok) headers.Authorization = 'Bearer ' + tok;
  const started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const stamp = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);
  const fullPath = '/api/v1' + path;
  let res: any, json: any;
  try {
    res = await fetch(BACKEND_BASE + fullPath + qs, { method, headers, body: body ? JSON.stringify(body) : undefined });
    json = await res.json().catch(() => ({}));
  } catch (err) {
    pushLog({ t: Date.now(), mode: 'real', method, path: fullPath + qs, status: 0, ms: stamp(), ok: false });
    throw new ApiError(0, 'Network error — backend unreachable at ' + (BACKEND_BASE || '(same origin)') + '/api/v1', null);
  }
  pushLog({ t: Date.now(), mode: 'real', method, path: fullPath + qs, status: res.status, ms: stamp(), ok: res.ok });
  if (!res.ok) {
    const msg = (json && (json.title || json.message || json.detail)) || ('HTTP ' + res.status);
    const field = json && (json.field || (json.errors && typeof json.errors === 'object' && Object.keys(json.errors)[0]));
    if (res.status === 401 && auth && !bearer) clearTokens();
    throw new ApiError(res.status, msg, { ...(json || {}), field });
  }
  return json;
}

// ═══════════════════════════════════════════════════════════════════
//  MOCK BACKEND
//  Persistent ledger + UltimatePOS-shaped serializers.
// ═══════════════════════════════════════════════════════════════════
const numId = (id: any) => typeof id === 'number' ? id : parseInt(String(id).replace(/\D/g, ''), 10) || 0;
const CAT_NUM: any = { drinks: 1, grocery: 2, bakery: 3, dairy: 4, home: 5, pharmacy: 6, snacks: 7 };
const f4 = (n: any) => Number(n).toFixed(4);

// Reference data the registration wizard reads from the API.
const CURRENCIES: any[] = [
  { id: 1, code: 'USD', symbol: '$', name: 'US Dollar' },
  { id: 2, code: 'SOS', symbol: 'Sh', name: 'Somali Shilling' },
  { id: 3, code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { id: 4, code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  { id: 5, code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { id: 6, code: 'EUR', symbol: '€', name: 'Euro' },
  { id: 7, code: 'GBP', symbol: '£', name: 'British Pound' },
];
const TIMEZONES: string[] = ['Africa/Mogadishu (EAT, UTC+3)', 'Africa/Nairobi (EAT, UTC+3)', 'Africa/Addis_Ababa (EAT, UTC+3)', 'Asia/Dubai (GST, UTC+4)', 'Europe/London (GMT, UTC+0)', 'Europe/Istanbul (TRT, UTC+3)', 'UTC'];
const DISPOSABLE_DOMAINS: string[] = ['tempmail.com', 'temp-mail.org', 'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'throwaway.email', 'yopmail.com', 'getnada.com', 'trashmail.com', 'sharklasers.com'];
const REGISTERED_USERNAMES: string[] = ['amina', 'admin'];

// ── Product catalog reference data (units, brands, variations, tax) ──
const UNITS: any[] = [
  { id: 1, actual_name: 'Pieces', short_name: 'Pc(s)', allow_decimal: 0 },
  { id: 2, actual_name: 'Kilograms', short_name: 'kg', allow_decimal: 1 },
  { id: 3, actual_name: 'Grams', short_name: 'g', allow_decimal: 1 },
  { id: 4, actual_name: 'Litres', short_name: 'L', allow_decimal: 1 },
  { id: 5, actual_name: 'Millilitres', short_name: 'ml', allow_decimal: 1 },
  { id: 6, actual_name: 'Box', short_name: 'box', allow_decimal: 0 },
  { id: 7, actual_name: 'Bottle', short_name: 'btl', allow_decimal: 0 },
  { id: 8, actual_name: 'Packet', short_name: 'pkt', allow_decimal: 0 },
  { id: 9, actual_name: 'Dozen', short_name: 'dz', allow_decimal: 0, base_unit_id: 1, base_unit_multiplier: 12 },
];
const BRANDS: any[] = [
  { id: 1, name: 'Generic' }, { id: 2, name: 'Nestlé' }, { id: 3, name: 'Coca-Cola' },
  { id: 4, name: 'Unilever' }, { id: 5, name: 'Local Farm' }, { id: 6, name: 'Pharma Co' },
];
const VARIATION_TEMPLATES: any[] = [
  { id: 1, name: 'Size', values: [{ id: 1, name: 'Small' }, { id: 2, name: 'Medium' }, { id: 3, name: 'Large' }] },
  { id: 2, name: 'Colour', values: [{ id: 4, name: 'Red' }, { id: 5, name: 'Blue' }, { id: 6, name: 'Green' }] },
  { id: 3, name: 'Weight', values: [{ id: 7, name: '250g' }, { id: 8, name: '500g' }, { id: 9, name: '1kg' }] },
];
const TAX_RATES: any[] = [
  { id: 0, name: 'None', amount: 0 }, { id: 1, name: 'VAT 5%', amount: 5 },
  { id: 2, name: 'VAT 15%', amount: 15 }, { id: 3, name: 'GST 18%', amount: 18 },
];
// tax groups combine multiple rates onto one invoice
let TAXGROUP_SEQ = 10;
const TAX_GROUPS: any[] = [
  { id: 101, name: 'VAT + City levy', tax_ids: [1, 0] },
];
function serializeTaxGroup(g: any) { const members = g.tax_ids.map((id: any) => TAX_RATES.find((t: any) => t.id === id)).filter(Boolean); return { ...g, members: members.map((m: any) => m.name), total_rate: members.reduce((s: any, m: any) => s + m.amount, 0) }; }

// ── Stock adjustments (loss / damage / recovery) ────────────────────
let ADJ_SEQ = 2;
const STOCK_ADJUSTMENTS: any[] = [
  { id: 1, ref: 'SA2024-0001', location_id: 1, date: '2024-11-08', type: 'normal', reason: 'Expired stock', lines: [{ product_id: 17, qty: 6 }, { product_id: 19, qty: 2 }] },
  { id: 2, ref: 'SA2024-0002', location_id: 1, date: '2024-11-13', type: 'abnormal', reason: 'Breakage', lines: [{ product_id: 3, qty: 4 }] },
];
function serializeAdjustment(a: any) {
  return { ...a, location_name: (LOCATION_LIST.find((l: any) => l.id === a.location_id) || {}).name || '—', item_count: a.lines.reduce((s: any, l: any) => s + l.qty, 0), total_value: +a.lines.reduce((s: any, l: any) => { const p = PRODUCTS.find((p: any) => numId(p.id) === l.product_id); return s + (p ? p.cost * l.qty : 0); }, 0).toFixed(2) };
}
let UNIT_SEQ = 100, BRAND_SEQ = 100, VAR_SEQ = 100, VARVAL_SEQ = 100;

// ── Contacts (customers & suppliers) + customer groups ──────────────
const CUSTOMER_GROUPS: any[] = [
  { id: 0, name: 'None', amount: 0 },
  { id: 1, name: 'Retail', amount: 0 },
  { id: 2, name: 'Wholesale', amount: -10 },   // -10% off selling price
  { id: 3, name: 'Friends & Family', amount: -20 },
];
// type: customer | supplier | both. balances are signed: +ve = they owe us.
const CONTACTS: any[] = [
  { id: 1, type: 'customer', name: 'Walk-in Customer', contact_id: 'CO0001', mobile: '', email: '', address: '', tax_number: '', customer_group_id: 1, pay_term_number: null, pay_term_type: 'days', credit_limit: null, opening_balance: 0, advance_balance: 0, total_sale: 0, total_paid: 0 },
  { id: 2, type: 'customer', name: 'Khadija Ali', contact_id: 'CO0002', mobile: '+252 61 552 1190', email: 'khadija@example.so', address: 'Hodan District, Mogadishu', tax_number: '', customer_group_id: 1, pay_term_number: 30, pay_term_type: 'days', credit_limit: 500, opening_balance: 0, advance_balance: 0, total_sale: 1840.50, total_paid: 1798.50 },
  { id: 3, type: 'customer', name: 'Mohamed Farah', contact_id: 'CO0003', mobile: '+252 63 412 8830', email: '', address: 'Wadajir, Mogadishu', tax_number: '', customer_group_id: 2, pay_term_number: 15, pay_term_type: 'days', credit_limit: 1000, opening_balance: 120, advance_balance: 0, total_sale: 980.20, total_paid: 938.20 },
  { id: 4, type: 'customer', name: 'Hodan Said', contact_id: 'CO0004', mobile: '+252 61 778 4420', email: 'hodan.said@example.so', address: 'Yaqshid, Mogadishu', tax_number: '', customer_group_id: 3, pay_term_number: null, pay_term_type: 'days', credit_limit: null, opening_balance: 0, advance_balance: 50, total_sale: 2410.00, total_paid: 2460.00 },
  { id: 5, type: 'supplier', name: 'Juba Foods Ltd', contact_id: 'SP0001', mobile: '+252 61 200 3311', email: 'sales@jubafoods.so', address: 'Industrial Rd, Mogadishu', tax_number: 'VAT-44120', customer_group_id: 0, pay_term_number: 30, pay_term_type: 'days', credit_limit: null, opening_balance: 0, advance_balance: 0, total_purchase: 12400, total_paid: 11160 },
  { id: 6, type: 'supplier', name: 'Banadir Beverages', contact_id: 'SP0002', mobile: '+252 61 905 7740', email: '', address: 'Bakara Market, Mogadishu', tax_number: 'VAT-88210', customer_group_id: 0, pay_term_number: 14, pay_term_type: 'days', credit_limit: null, opening_balance: 0, advance_balance: 0, total_purchase: 6820, total_paid: 6820 },
  { id: 7, type: 'both', name: 'Sahra Trading', contact_id: 'CT0001', mobile: '+252 62 114 9900', email: 'sahra@trading.so', address: 'Hamarweyne, Mogadishu', tax_number: '', customer_group_id: 1, pay_term_number: 30, pay_term_type: 'days', credit_limit: 800, opening_balance: 0, advance_balance: 0, total_sale: 640, total_paid: 600, total_purchase: 3200, total_paid_supplier: 3000 },
];
let CONTACT_SEQ = 100, CG_SEQ = 100;
const PAYMENTS: any[] = [];   // recorded payments against contacts

// ── Locations, invoice schemes, layouts, price groups ───────────────
const INVOICE_SCHEMES: any[] = [
  { id: 1, name: 'Default', prefix: 'INV', number_type: 'sequential', start_number: 1, total_digits: 4, is_default: true },
  { id: 2, name: 'Counter Quick', prefix: 'CQ', number_type: 'sequential', start_number: 1000, total_digits: 4, is_default: false },
];
const INVOICE_LAYOUTS: any[] = [
  { id: 1, name: 'Default (A4)', is_default: true, design: 'classic', header_text: '', show_address: true, show_tax_summary: true, show_total_in_words: false, show_discount: true, hide_prices: false, show_qr: false, show_letterhead: false, footer_text: 'Thank you for your business!' },
  { id: 2, name: 'Thermal 80mm', is_default: false, design: 'slim', header_text: '', show_address: true, show_tax_summary: false, show_total_in_words: false, show_discount: true, hide_prices: false, show_qr: true, show_letterhead: false, footer_text: 'Mahadsanid! Come again' },
];
let LAYOUT_SEQ = 100;
const SELLING_PRICE_GROUPS: any[] = [
  { id: 0, name: 'Default selling price', percent: 0, is_default: true },
  { id: 1, name: 'Wholesale', percent: -10 },
  { id: 2, name: 'Retail', percent: 0 },
];
let PRICE_GROUP_SEQ = 100;
const PAYMENT_METHOD_KEYS: any[] = [
  { key: 'cash', label: 'Cash' }, { key: 'zaad', label: 'Zaad' }, { key: 'evc', label: 'EVC Plus' },
  { key: 'card', label: 'Card' }, { key: 'bank', label: 'Bank transfer' }, { key: 'advance', label: 'Advance balance' },
];
const LOCATION_LIST: any[] = [
  { id: 1, name: 'Main Store', type: 'Retail', landmark: 'Maka Al Mukarama Rd', city: 'Mogadishu', mobile: '+252 61 000 1001', manager: 'Amina Yusuf', invoice_scheme_id: 1, invoice_layout_id: 1, price_group_id: 0, payment_methods: ['cash', 'zaad', 'evc', 'card'], default_payment: 'cash', status: 'active', sales: 842.50, stock: 11200 },
  { id: 2, name: 'Counter', type: 'Kiosk', landmark: 'Front entrance — Main Store', city: 'Mogadishu', mobile: '+252 61 000 1002', manager: 'Bashir M.', invoice_scheme_id: 2, invoice_layout_id: 2, price_group_id: 2, payment_methods: ['cash', 'evc'], default_payment: 'cash', status: 'active', sales: 312.00, stock: 2100 },
  { id: 3, name: 'Back Store', type: 'Warehouse', landmark: 'Warehouse Block C, Industrial Rd', city: 'Mogadishu', mobile: '+252 61 000 1003', manager: 'Nimco H.', invoice_scheme_id: 1, invoice_layout_id: 1, price_group_id: 1, payment_methods: ['cash', 'bank'], default_payment: 'bank', status: 'active', sales: 0, stock: 6120 },
  { id: 4, name: 'Branch 2 — Hodan', type: 'Retail', landmark: 'Hodan District, Wadajir St', city: 'Mogadishu', mobile: '+252 61 000 1004', manager: 'Cali D.', invoice_scheme_id: 1, invoice_layout_id: 1, price_group_id: 0, payment_methods: ['cash', 'zaad', 'evc', 'card'], default_payment: 'cash', status: 'inactive', sales: 130.00, stock: 4300 },
];
let LOC_SEQ = 100, SCHEME_SEQ = 100;

// ── Purchases & opening stock ───────────────────────────────────────
const PURCHASES: any[] = [
  { id: 1, ref_no: 'PO2024-0001', supplier_id: 5, location_id: 1, date: '2024-11-02', status: 'received', payment_status: 'paid', discount: 0, tax: 0, paid: 1240, lines: [{ product_id: 6, qty: 40, unit_cost: 6.2 }, { product_id: 7, qty: 30, unit_cost: 4.8 }] },
  { id: 2, ref_no: 'PO2024-0002', supplier_id: 6, location_id: 1, date: '2024-11-08', status: 'received', payment_status: 'due', discount: 0, tax: 0, paid: 200, lines: [{ product_id: 2, qty: 120, unit_cost: 0.3 }, { product_id: 3, qty: 90, unit_cost: 0.55 }] },
];
let PURCHASE_SEQ = 2;
function purchaseTotal(p: any) { return p.lines.reduce((s: any, l: any) => s + l.qty * l.unit_cost, 0) - (p.discount || 0) + (p.tax || 0); }
function serializePurchase(p: any) {
  const sup = CONTACTS.find((c: any) => c.id === p.supplier_id) || {};
  const loc = LOCATION_LIST.find((l: any) => l.id === p.location_id) || {};
  const total = purchaseTotal(p);
  return { ...p, supplier_name: sup.name || '—', location_name: loc.name || '—', item_count: p.lines.reduce((s: any, l: any) => s + l.qty, 0), grand_total: total, due: Math.max(0, +(total - (p.paid || 0)).toFixed(2)) };
}
function addStock(p: any, variation: any, qty: any) {
  if (variation && p.variations) { const v = p.variations.find((v: any) => v.name === variation); if (v) v.stock += qty; p.stock = p.variations.reduce((s: any, x: any) => s + x.stock, 0); return; }
  if (p.stock === Infinity) return;
  p.stock = (p.stock || 0) + qty;
}

// ── Users, Roles & Permissions ──────────────────────────────────────
const PERMISSION_GROUPS: any[] = [
  { group: 'Point of Sale', items: [{ key: 'pos.access', label: 'Access POS / till' }] },
  { group: 'Products', items: [{ key: 'product.view', label: 'View products' }, { key: 'product.create', label: 'Create' }, { key: 'product.update', label: 'Edit' }, { key: 'product.delete', label: 'Delete' }] },
  { group: 'Sales', items: [{ key: 'sell.view', label: 'View sales' }, { key: 'sell.create', label: 'Create sale' }, { key: 'sell.update', label: 'Edit' }, { key: 'sell.delete', label: 'Delete / return' }] },
  { group: 'Contacts', items: [{ key: 'contact.view', label: 'View contacts' }, { key: 'contact.create', label: 'Create' }, { key: 'contact.update', label: 'Edit' }] },
  { group: 'Purchases', items: [{ key: 'purchase.view', label: 'View purchases' }, { key: 'purchase.create', label: 'Create' }] },
  { group: 'Reports', items: [{ key: 'report.view', label: 'View reports' }] },
  { group: 'Settings', items: [{ key: 'settings.access', label: 'Business settings' }] },
  { group: 'User management', items: [{ key: 'user.manage', label: 'Manage users' }, { key: 'role.manage', label: 'Manage roles' }] },
];
const ALL_PERMS: any[] = PERMISSION_GROUPS.flatMap((g: any) => g.items.map((i: any) => i.key));
const ROLES: any[] = [
  { id: 1, name: 'Admin', is_default: true, permissions: 'all', location_access: 'all' },
  { id: 2, name: 'Cashier', is_default: true, permissions: ['pos.access', 'sell.create', 'product.view', 'contact.view', 'contact.create'], location_access: 'all' },
  { id: 3, name: 'Manager', is_default: false, permissions: ['pos.access', 'product.view', 'product.create', 'product.update', 'sell.view', 'sell.create', 'sell.update', 'contact.view', 'contact.create', 'contact.update', 'purchase.view', 'purchase.create', 'report.view'], location_access: 'all' },
];
const USERS_DATA: any[] = [
  { id: 1, name: 'Amina Yusuf', email: 'amina@hodanmarket.so', username: 'amina', role_id: 1, location_access: 'all', commission_percent: 0, max_discount: null, is_active: true, allow_login: true },
  { id: 2, name: 'Bashir Maxamed', email: 'bashir@hodanmarket.so', username: 'bashir', role_id: 3, location_access: [1, 2], commission_percent: 2, max_discount: 10, is_active: true, allow_login: true },
  { id: 3, name: 'Nimco Hassan', email: 'nimco@hodanmarket.so', username: 'nimco', role_id: 2, location_access: [1], commission_percent: 0, max_discount: 5, is_active: true, allow_login: true },
  { id: 4, name: 'Cali Daud', email: 'cali@hodanmarket.so', username: 'cali', role_id: 2, location_access: [4], commission_percent: 0, max_discount: 5, is_active: false, allow_login: false },
];
let USER_SEQ = 100, ROLE_SEQ = 100;

// ── Reward points / Loyalty ─────────────────────────────────────────
const REWARD_SETTINGS: any = {
  enabled: true,
  display_name: 'Reward Points',
  amount_per_unit_point: 10,      // $ spent to earn 1 point
  min_order_total_earn: 5,        // min invoice to earn
  max_points_per_order: 200,      // cap per invoice (null = none)
  redeem_amount_per_point: 0.10,  // $ value of 1 point
  min_order_total_redeem: 10,
  min_redeem_point: 50,
  max_redeem_point: 1000,
  expiry_period: 12,
  expiry_type: 'months',
};
function rewardMembers() {
  return CONTACTS.filter((c: any) => c.type === 'customer' || c.type === 'both').filter((c: any) => c.name !== 'Walk-in Customer').map((c: any) => {
    const earned = Math.floor((c.total_sale || 0) / REWARD_SETTINGS.amount_per_unit_point);
    const points = Math.max(0, earned - (c.points_redeemed || 0));
    const tier = points >= 400 ? 'Gold' : points >= 150 ? 'Silver' : 'Bronze';
    return { id: c.id, name: c.name, contact_id: c.contact_id, mobile: c.mobile, lifetime_points: earned, points, tier, total_sale: c.total_sale || 0 };
  });
}

// ── Commission Agent / Sales Representative report ──────────────────
const COMMISSION_SETTINGS: any = { enabled: true, agent_type: 'logged_in_user', calculation_type: 'invoice_value' };
function repTransactions(user: any) {
  const fn = (user.name || '').split(' ')[0];
  return SALES.filter((s: any) => (s.cashier || '').startsWith(fn)).map((s: any) => ({
    id: s.id, total: s.total, status: s.status,
    received: s.status === 'completed' ? s.total : 0,
  }));
}
function salesRep(user: any, calc: any) {
  const txs = repTransactions(user);
  const total_sale = +txs.reduce((a: any, t: any) => a + t.total, 0).toFixed(2);
  const total_received = +txs.reduce((a: any, t: any) => a + t.received, 0).toFixed(2);
  const pct = user.commission_percent || 0;
  const base = (calc === 'payment_received') ? total_received : total_sale;
  const commission = +(base * pct / 100).toFixed(2);
  const r = ROLES.find((r: any) => r.id === user.role_id);
  return { user_id: user.id, name: user.name, role_name: r ? r.name : '—', commission_percent: pct, total_sale, total_received, total_expense: 0, commission, tx_count: txs.length, transactions: txs };
}

// ── Cash Register (cashier session) ─────────────────────────────────
let REGISTER_SEQ = 1;
const REGISTERS: any[] = [
  { id: 1, user_name: 'Bashir Maxamed', location_id: 1, location_name: 'Main Store', opening_cash: 100, opened_at: '2024-11-16 08:02:00', closed_at: '2024-11-16 16:30:00', status: 'closed',
    totals: { cash: 540, zaad: 392.5, evc: 248, card: 104, bank: 0, advance: 0 }, refunds: 12, total_sales: 1284.5, tx_count: 96,
    closing: { total_cash: 628, total_card: 104, total_cheque: 0, note: 'Balanced' } },
];
let CURRENT_REGISTER: any = null;
// ── Parked orders: suspended / draft / quotation ────────────────────
let HELD_SEQ = 0;
const HELD_SALES: any[] = [];
function serializeHeld(h: any) { return { ...h, item_count: (h.cart || []).reduce((s: any, c: any) => s + c.qty, 0) }; }

// ── Stock transfers (location → location) ───────────────────────────
let TRANSFER_SEQ = 2;
const TRANSFERS: any[] = [
  { id: 1, ref: 'ST2024-0001', from_location_id: 1, to_location_id: 2, date: '2024-11-10', status: 'completed', lines: [{ product_id: 1, qty: 20, unit_cost: 0.6 }, { product_id: 2, qty: 48, unit_cost: 0.3 }] },
  { id: 2, ref: 'ST2024-0002', from_location_id: 3, to_location_id: 1, date: '2024-11-14', status: 'in_transit', lines: [{ product_id: 6, qty: 12, unit_cost: 6.2 }] },
];
function serializeTransfer(t: any) {
  const from = LOCATION_LIST.find((l: any) => l.id === t.from_location_id) || {};
  const to = LOCATION_LIST.find((l: any) => l.id === t.to_location_id) || {};
  return { ...t, from_name: from.name || '—', to_name: to.name || '—', item_count: t.lines.reduce((s: any, l: any) => s + l.qty, 0), total_value: +t.lines.reduce((s: any, l: any) => s + l.qty * l.unit_cost, 0).toFixed(2) };
}

// ── Sales / Purchase Orders (documents — no stock movement) ─────────
let PO_SEQ = 1, SO_SEQ = 1;
const PURCHASE_ORDER_DOCS: any[] = [
  { id: 1, ref: 'PO-0001', supplier_id: 5, location_id: 1, date: '2024-11-12', status: 'ordered', lines: [{ product_id: 6, qty: 50, unit_cost: 6.2 }, { product_id: 9, qty: 80, unit_cost: 0.95 }] },
];
const SALES_ORDER_DOCS: any[] = [
  { id: 1, ref: 'SO-0001', contact_id: 2, location_id: 1, date: '2024-11-15', status: 'ordered', lines: [{ product_id: 6, qty: 10, unit_price: 8.9 }, { product_id: 17, qty: 24, unit_price: 1.3 }] },
];
function serializePO(o: any) {
  const sup = CONTACTS.find((c: any) => c.id === o.supplier_id) || {};
  return { ...o, party_name: sup.name || '—', location_name: (LOCATION_LIST.find((l: any) => l.id === o.location_id) || {}).name || '—', item_count: o.lines.reduce((s: any, l: any) => s + l.qty, 0), total: +o.lines.reduce((s: any, l: any) => s + l.qty * l.unit_cost, 0).toFixed(2) };
}
function serializeSO(o: any) {
  const c = CONTACTS.find((c: any) => c.id === o.contact_id) || {};
  return { ...o, party_name: c.name || '—', location_name: (LOCATION_LIST.find((l: any) => l.id === o.location_id) || {}).name || '—', item_count: o.lines.reduce((s: any, l: any) => s + l.qty, 0), total: +o.lines.reduce((s: any, l: any) => s + l.qty * l.unit_price, 0).toFixed(2) };
}

// ── Discounts (brand / category / location, priority, date range) ───
let DISCOUNT_SEQ = 2;
const DISCOUNTS: any[] = [
  { id: 1, name: 'Ramadan Grocery', brand_id: null, category: 'grocery', location_id: null, priority: 1, type: 'percentage', value: 10, starts_at: '2024-11-01', ends_at: '2024-12-31', apply_price_groups: true, apply_customer_groups: false, is_active: true },
  { id: 2, name: 'Main Store Drinks', brand_id: null, category: 'drinks', location_id: 1, priority: 2, type: 'fixed', value: 0.25, starts_at: '2024-11-10', ends_at: '2024-11-30', apply_price_groups: false, apply_customer_groups: true, is_active: true },
];
function serializeDiscount(d: any) {
  return { ...d, brand_name: d.brand_id ? (BRANDS.find((b: any) => b.id === d.brand_id) || {}).name : null, category_name: d.category ? (CATEGORIES.find((c: any) => c.id === d.category) || {}).name : null, location_name: d.location_id ? (LOCATION_LIST.find((l: any) => l.id === d.location_id) || {}).name : 'All locations' };
}

// ── Types of Service (restaurant: dine-in / parcel / delivery) ──────
let SERVICE_SEQ = 3;
const TYPES_OF_SERVICE: any[] = [
  { id: 1, name: 'Dine-in', price_group_id: 0, packing_charge: 0, packing_charge_type: 'fixed', enabled: true },
  { id: 2, name: 'Parcel / Takeaway', price_group_id: 0, packing_charge: 0.5, packing_charge_type: 'fixed', enabled: true },
  { id: 3, name: 'Delivery', price_group_id: 0, packing_charge: 5, packing_charge_type: 'percentage', enabled: true },
];

// ── Modules (sellable add-ons; gate features on/off) ────────────────
const MODULES: any[] = [
  { key: 'pos', name: 'Point of Sale', icon: '⊞', group: 'Core', enabled: true, core: true, addon: false, price: 0 },
  { key: 'inventory', name: 'Inventory', icon: '◫', group: 'Core', enabled: true, core: true, addon: false, price: 0 },
  { key: 'crm', name: 'Sales & CRM', icon: '◉', group: 'Core', enabled: true, core: true, addon: false, price: 0 },
  { key: 'loyalty', name: 'Loyalty & Coupons', icon: '◆', group: 'Growth', enabled: true, core: false, addon: false, price: 0 },
  { key: 'multilocation', name: 'Multi-location', icon: '☖', group: 'Add-on', enabled: true, core: false, addon: false, price: 0 },
  { key: 'projects', name: 'Projects & Tasks', icon: '◳', group: 'Operations', enabled: true, core: false, addon: false, price: 0 },
  { key: 'insights', name: 'AI Insights', icon: '✦', group: 'Add-on', enabled: true, core: false, addon: true, price: 12 },
  { key: 'pharmacy', name: 'Pharmacy', icon: '✚', group: 'Vertical', enabled: true, core: false, addon: true, price: 15 },
  { key: 'restaurant', name: 'Restaurant', icon: '♨', group: 'Vertical', enabled: false, core: false, addon: true, price: 19 },
  { key: 'hotel', name: 'Hotel', icon: '⌂', group: 'Vertical', enabled: false, core: false, addon: true, price: 25 },
  { key: 'wholesale', name: 'Wholesale', icon: '⊟', group: 'Vertical', enabled: true, core: false, addon: true, price: 14 },
  { key: 'construction', name: 'Construction', icon: '◭', group: 'Vertical', enabled: false, core: false, addon: true, price: 22 },
  { key: 'hrm', name: 'HRM / Essentials', icon: '⚇', group: 'Operations', enabled: false, core: false, addon: true, price: 18 },
  { key: 'superadmin', name: 'Superadmin (SaaS)', icon: '⚿', group: 'Platform', enabled: false, core: false, addon: true, price: 39 },
];
const moduleOn = (key: any) => { const m = MODULES.find((m: any) => m.key === key); return m ? m.enabled : false; };

// ── HRM / Essentials (employees, attendance, leave, payroll, todo) ──
let EMP_SEQ = 5, LEAVE_SEQ = 3, PAY_SEQ = 2, TODO_SEQ = 4;
const DEPARTMENTS: string[] = ['Sales', 'Inventory', 'Finance', 'Management', 'Kitchen'];
const DESIGNATIONS: string[] = ['Cashier', 'Store Keeper', 'Accountant', 'Manager', 'Chef', 'Cleaner'];
const EMPLOYEES: any[] = [
  { id: 1, name: 'Amina Yusuf', email: 'amina@hodanmarket.so', department: 'Management', designation: 'Manager', location_id: 1, salary: 900, joined: '2024-01-12', status: 'active', user_id: 1, commission_percent: 0 },
  { id: 2, name: 'Bashir Maxamed', email: 'bashir@hodanmarket.so', department: 'Sales', designation: 'Cashier', location_id: 1, salary: 420, joined: '2024-02-05', status: 'active', user_id: 2, commission_percent: 2 },
  { id: 3, name: 'Sahra Jama', email: 'sahra@hodanmarket.so', department: 'Sales', designation: 'Cashier', location_id: 1, salary: 400, joined: '2024-03-20', status: 'active', user_id: 3, commission_percent: 2 },
  { id: 4, name: 'Cali Daud', email: 'cali@hodanmarket.so', department: 'Inventory', designation: 'Store Keeper', location_id: 2, salary: 380, joined: '2024-05-11', status: 'active', user_id: null, commission_percent: 0 },
  { id: 5, name: 'Khadiijo Nuur', email: 'khadiijo@hodanmarket.so', department: 'Finance', designation: 'Accountant', location_id: 1, salary: 600, joined: '2024-06-01', status: 'on_leave', user_id: null, commission_percent: 0 },
];
const ATTENDANCE: any[] = [
  { id: 1, employee_id: 1, date: '2024-11-18', clock_in: '08:02', clock_out: '17:05', status: 'present' },
  { id: 2, employee_id: 2, date: '2024-11-18', clock_in: '08:15', clock_out: '16:50', status: 'present' },
  { id: 3, employee_id: 3, date: '2024-11-18', clock_in: '09:20', clock_out: '17:00', status: 'late' },
  { id: 4, employee_id: 4, date: '2024-11-18', clock_in: '', clock_out: '', status: 'absent' },
];
const LEAVES: any[] = [
  { id: 1, employee_id: 5, type: 'Sick', from: '2024-11-15', to: '2024-11-20', days: 6, reason: 'Medical', status: 'approved' },
  { id: 2, employee_id: 2, type: 'Casual', from: '2024-11-25', to: '2024-11-26', days: 2, reason: 'Family event', status: 'pending' },
  { id: 3, employee_id: 3, type: 'Annual', from: '2024-12-01', to: '2024-12-07', days: 7, reason: 'Vacation', status: 'pending' },
];
const PAYROLL: any[] = [
  { id: 1, employee_id: 1, month: '2024-10', basic: 900, allowance: 50, deduction: 0, net: 950, status: 'paid' },
  { id: 2, employee_id: 2, month: '2024-10', basic: 420, allowance: 20, deduction: 15, net: 425, status: 'paid' },
];
// annual leave entitlements (days/year per type) + accrual config
let LEAVE_TYPE_SEQ = 4;
const LEAVE_TYPES: any[] = [
  { id: 1, name: 'Annual', default_days: 24, accrues: true, paid: true },
  { id: 2, name: 'Sick', default_days: 12, accrues: false, paid: true },
  { id: 3, name: 'Casual', default_days: 6, accrues: false, paid: true },
  { id: 4, name: 'Unpaid', default_days: 0, accrues: false, paid: false },
];
// per-employee entitlement overrides: { [empId]: { [typeName]: days } }
const EMP_LEAVE_OVERRIDE: any = {};
function entitlementFor(empId: any, type: any) {
  const ov = (EMP_LEAVE_OVERRIDE[empId] || {})[type.name];
  return ov != null ? ov : type.default_days;
}
// leave balance per employee across all admin-defined types
function leaveBalance(empId: any) {
  const emp = EMPLOYEES.find((e: any) => e.id === empId) || {};
  const joined = new Date(emp.joined || '2024-01-01');
  const now = new Date();
  const monthsWorked = Math.max(0, (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth()) + 1);
  return LEAVE_TYPES.map((t: any) => {
    const base = entitlementFor(empId, t);
    const entitled = t.accrues ? Math.min(base, +((base / 12) * monthsWorked).toFixed(1)) : base;
    const taken = LEAVES.filter((l: any) => l.employee_id === empId && l.type === t.name && l.status === 'approved').reduce((s: any, l: any) => s + l.days, 0);
    const pending = LEAVES.filter((l: any) => l.employee_id === empId && l.type === t.name && l.status === 'pending').reduce((s: any, l: any) => s + l.days, 0);
    return { type: t.name, paid: t.paid, entitled, taken, pending, balance: +(entitled - taken).toFixed(1) };
  });
}
const HR_TODOS: any[] = [
  { id: 1, title: 'Approve November leave requests', assigned_to: 1, priority: 'high', status: 'pending', due: '2024-11-22' },
  { id: 2, title: 'Process October payroll', assigned_to: 5, priority: 'high', status: 'done', due: '2024-11-01' },
  { id: 3, title: 'Onboard new cashier', assigned_to: 1, priority: 'medium', status: 'pending', due: '2024-11-28' },
  { id: 4, title: 'Update staff handbook', assigned_to: 1, priority: 'low', status: 'pending', due: '2024-12-05' },
];
const empName = (id: any) => (EMPLOYEES.find((e: any) => e.id === id) || {}).name || '—';

// HRM settings — attendance grace time, standard work day, shift defaults.
const HRM_SETTINGS: any = {
  work_start: '09:00',          // on-time threshold
  grace_minutes: 15,            // minutes past work_start still counted on-time
  standard_hours: 8,            // expected hours per day
  half_day_hours: 4,
  overtime_rate: 1.5,           // multiplier on hourly rate beyond standard hours
  working_days: 26,             // days/month used to derive an hourly rate from monthly salary
  late_deduction: 2,            // fixed amount deducted per late day
  absent_deduction: 'day',      // 'day' = one day's pay per absent day, or a fixed number
};
// what sections appear on the payslip
const PAYSLIP_SETTINGS: any = {
  show_attendance: true, show_overtime: true, show_leave: true,
  show_advance: true, show_bonus: true, show_incentive: true, show_deduction_breakdown: true,
};
// aggregate everything for one employee + month into a payslip
function buildPayslip(payId: any) {
  const p = PAYROLL.find((x: any) => x.id === payId); if (!p) return null;
  const emp = EMPLOYEES.find((e: any) => e.id === p.employee_id) || {};
  const att = attendanceSummary(p.employee_id, p.month);
  const leave = LEAVES.filter((l: any) => l.employee_id === p.employee_id && l.status === 'approved').map((l: any) => ({ type: l.type, days: l.days, from: l.from, to: l.to }));
  const advance_recovered = +(p.deduction && ADVANCES.filter((a: any) => a.employee_id === p.employee_id).length ? Math.min(p.deduction, ADVANCES.filter((a: any) => a.employee_id === p.employee_id).reduce((s: any, a: any) => s + a.amount, 0)) : 0).toFixed(2);
  return {
    employee: { name: emp.name, designation: emp.designation, department: emp.department, location: (LOCATION_LIST.find((l: any) => l.id === emp.location_id) || {}).name || '' },
    month: p.month,
    earnings: { basic: p.basic, allowance: p.allowance || 0, overtime: p.overtime || 0, bonus: p.bonus || 0, incentive: p.incentive || 0 },
    deductions: { total: p.deduction || 0, late: att.late_deduction, absent: att.absent_deduction, advance_recovered },
    attendance: { days_worked: att.days_worked, total_hours: att.total_hours, overtime_hours: att.overtime_hours, present: att.present, late: att.late, absent: att.absent },
    leave, net: p.net, status: p.status,
    settings: PAYSLIP_SETTINGS,
  };
}
// month-to-date attendance summary + pay derivation for an employee
function attendanceSummary(empId: any, month?: any) {
  const m = month || new Date().toISOString().slice(0, 7);
  const rows = ATTENDANCE.filter((a: any) => a.employee_id === empId && a.date.startsWith(m));
  let present = 0, late = 0, absent = 0, hours = 0;
  rows.forEach((a: any) => {
    if (a.status === 'absent' || (!a.clock_in)) { absent++; return; }
    if (a.status === 'late') late++; else present++;
    if (a.clock_in && a.clock_out) { const brk = (a.breaks || []).reduce((s: any, b: any) => s + (b.end ? Math.max(0, minutesBetween(b.start, b.end)) : 0), 0); hours += Math.max(0, minutesBetween(a.clock_in, a.clock_out) - brk) / 60; }
  });
  const emp = EMPLOYEES.find((e: any) => e.id === empId) || {};
  const std = HRM_SETTINGS.standard_hours, days = rows.filter((a: any) => a.clock_in).length || 1;
  const expected = std * days;
  const overtime = Math.max(0, hours - expected);
  const hourly = (emp.salary || 0) / (HRM_SETTINGS.working_days * std || 1);
  const overtime_pay = +(overtime * hourly * HRM_SETTINGS.overtime_rate).toFixed(2);
  const dayPay = (emp.salary || 0) / (HRM_SETTINGS.working_days || 1);
  const late_deduction = +(late * (HRM_SETTINGS.late_deduction || 0)).toFixed(2);
  const absent_deduction = +(absent * (HRM_SETTINGS.absent_deduction === 'day' ? dayPay : Number(HRM_SETTINGS.absent_deduction || 0))).toFixed(2);
  const total_deduction = +(late_deduction + absent_deduction).toFixed(2);
  return { month: m, present, late, absent, days_worked: rows.filter((a: any) => a.clock_in).length, total_hours: +hours.toFixed(2), expected_hours: +expected.toFixed(2), overtime_hours: +overtime.toFixed(2), hourly_rate: +hourly.toFixed(2), overtime_pay, late_deduction, absent_deduction, total_deduction };
}
// per-employee shift assignment: 'fixed' (set hours) or 'flexible' (sales/profit-based, no late penalty)
const EMP_SHIFT: any = {
  1: { type: 'flexible', start: '', end: '' },
  2: { type: 'fixed', start: '08:00', end: '16:00' },
  3: { type: 'fixed', start: '12:00', end: '20:00' },
  4: { type: 'fixed', start: '09:00', end: '17:00' },
  5: { type: 'flexible', start: '', end: '' },
};
// minutes between two HH:MM strings
function minutesBetween(a: any, b: any) { const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); return (bh * 60 + bm) - (ah * 60 + am); }
function nowHM() { return new Date().toTimeString().slice(0, 5); }
// decorate an attendance row with worked hours + running status
function decorateAtt(a: any) {
  const emp = EMPLOYEES.find((e: any) => e.id === a.employee_id) || {};
  const flexible = (EMP_SHIFT[a.employee_id] || {}).type === 'flexible';
  const breakMin = (a.breaks || []).reduce((s: any, b: any) => s + (b.end ? Math.max(0, minutesBetween(b.start, b.end)) : 0), 0);
  const onBreak = (a.breaks || []).some((b: any) => !b.end);
  let status = a.status, hours = 0, running = false;
  if (a.clock_in && !a.clock_out) { running = true; status = onBreak ? 'on break' : 'running'; hours = (Math.max(0, minutesBetween(a.clock_in, nowHM())) - breakMin) / 60; }
  else if (a.clock_in && a.clock_out) { hours = (Math.max(0, minutesBetween(a.clock_in, a.clock_out)) - breakMin) / 60; }
  hours = Math.max(0, hours);
  return { ...a, employee_name: empName(a.employee_id), flexible, on_break: onBreak, break_min: breakMin, hours: +hours.toFixed(2), hours_label: a.clock_in ? (Math.floor(hours) + 'h ' + Math.round((hours % 1) * 60) + 'm') : '—', status };
}
// on-time vs late using grace, skipped for flexible employees
function clockStatus(empId: any, t: any) {
  if ((EMP_SHIFT[empId] || {}).type === 'flexible') return 'present';
  const threshold = minutesBetween('00:00', HRM_SETTINGS.work_start) + HRM_SETTINGS.grace_minutes;
  return minutesBetween('00:00', t) > threshold ? 'late' : 'present';
}

// Shifts / roster (per employee, per location, per day)
let SHIFT_SEQ = 4;
const SHIFTS: any[] = [
  { id: 1, employee_id: 2, location_id: 1, date: '2024-11-18', start: '08:00', end: '16:00', role: 'Cashier' },
  { id: 2, employee_id: 3, location_id: 1, date: '2024-11-18', start: '12:00', end: '20:00', role: 'Cashier' },
  { id: 3, employee_id: 4, location_id: 2, date: '2024-11-18', start: '09:00', end: '17:00', role: 'Store Keeper' },
  { id: 4, employee_id: 2, location_id: 1, date: '2024-11-19', start: '08:00', end: '16:00', role: 'Cashier' },
];
function serializeShift(s: any) { return { ...s, employee_name: empName(s.employee_id), location_name: (LOCATION_LIST.find((l: any) => l.id === s.location_id) || {}).name || '—' }; }

// Shift-swap requests: an employee asks to give their shift to a colleague.
let SWAP_SEQ = 1;
const SHIFT_SWAPS: any[] = [
  { id: 1, shift_id: 1, from_id: 2, to_id: 3, reason: 'Doctor appointment', status: 'pending', date: '2024-11-17' },
];
function serializeSwap(s: any) {
  const shift = SHIFTS.find((x: any) => x.id === s.shift_id);
  return { ...s, from_name: empName(s.from_id), to_name: empName(s.to_id), shift: shift ? serializeShift(shift) : null };
}

// Advances / staff loans — paid from a payment account, deducted on payroll.
let ADVANCE_SEQ = 2;
const ADVANCES: any[] = [
  { id: 1, employee_id: 2, amount: 100, date: '2024-11-06', account_id: 1, note: 'Emergency advance', outstanding: 100, status: 'outstanding' },
  { id: 2, employee_id: 5, amount: 200, date: '2024-10-20', account_id: 2, note: 'Salary advance', outstanding: 0, status: 'settled' },
];
function serializeAdvance(a: any) { return { ...a, employee_name: empName(a.employee_id), account_name: (PAYMENT_ACCOUNTS.find((x: any) => x.id === a.account_id) || {}).name || '—' }; }
function outstandingAdvance(empId: any) { return +ADVANCES.filter((a: any) => a.employee_id === empId && a.status === 'outstanding').reduce((s: any, a: any) => s + a.outstanding, 0).toFixed(2); }

// Full employee profile — ties HR data to POS sales & commission.
function employeeProfile(e: any) {
  const txs = SALES.filter((s: any) => (s.cashier || '').startsWith((e.name || '').split(' ')[0]));
  const total_sale = +txs.reduce((a: any, t: any) => a + (t.total || 0), 0).toFixed(2);
  const commission = +(total_sale * (e.commission_percent || 0) / 100).toFixed(2);
  return {
    ...serializeEmp(e),
    user_name: e.user_id ? ((USERS_DATA.find((u: any) => u.id === e.user_id) || {}).name || null) : null,
    attendance: ATTENDANCE.filter((a: any) => a.employee_id === e.id).map((a: any) => ({ ...a })),
    leaves: LEAVES.filter((l: any) => l.employee_id === e.id).map((l: any) => ({ ...l })),
    payroll: PAYROLL.filter((p: any) => p.employee_id === e.id).map((p: any) => ({ ...p })),
    advances: ADVANCES.filter((a: any) => a.employee_id === e.id).map((a: any) => ({ ...a })),
    outstanding_advance: outstandingAdvance(e.id),
    leave_balance: leaveBalance(e.id),
    sales: { total_sale, tx_count: txs.length, commission, commission_percent: e.commission_percent || 0 },
  };
}
function serializeEmp(e: any) { return { ...e, location_name: (LOCATION_LIST.find((l: any) => l.id === e.location_id) || {}).name || '—' }; }

// ── Superadmin / SaaS (platform-owner data) ─────────────────────────
let PKG_SEQ = 3, BIZ_SEQ = 4;
const PACKAGES: any[] = [
  { id: 1, name: 'Starter', price: 29, interval: 'monthly', locations: 1, users: 3, products: 500, featured: false, active: true },
  { id: 2, name: 'Growth', price: 49, interval: 'monthly', locations: 3, users: 10, products: 5000, featured: true, active: true },
  { id: 3, name: 'Enterprise', price: 99, interval: 'monthly', locations: 99, users: 99, products: 99999, featured: false, active: true },
];
const BUSINESSES: any[] = [
  { id: 1, name: 'Hodan Mini Market', owner: 'Amina Yusuf', email: 'amina@hodanmarket.so', country: 'Somalia', package_id: 2, status: 'active', users: 4, created: '2024-01-12', expires: '2025-07-01' },
  { id: 2, name: 'Hargeisa Pharmacy', owner: 'Cabdi Jaamac', email: 'abdi@hargeisarx.so', country: 'Somaliland', package_id: 3, status: 'active', users: 9, created: '2024-03-04', expires: '2025-03-04' },
  { id: 3, name: 'Nairobi Fresh Foods', owner: 'Wanjiru K.', email: 'wanjiru@freshfoods.ke', country: 'Kenya', package_id: 1, status: 'trial', users: 2, created: '2024-11-02', expires: '2024-11-30' },
  { id: 4, name: 'Addis Coffee House', owner: 'Selam T.', email: 'selam@addiscoffee.et', country: 'Ethiopia', package_id: 1, status: 'expired', users: 3, created: '2024-06-18', expires: '2024-10-18' },
];
const SA_PAYMENTS: any[] = [
  { id: 1, business: 'Hodan Mini Market', amount: 49, gateway: 'Stripe', date: '2024-11-01', status: 'completed' },
  { id: 2, business: 'Hargeisa Pharmacy', amount: 99, gateway: 'Offline', date: '2024-11-04', status: 'completed' },
  { id: 3, business: 'Nairobi Fresh Foods', amount: 29, gateway: 'Offline', date: '2024-11-20', status: 'pending' },
];
let SA_GATEWAYS: any = { offline: true, stripe: true };
function serializeBiz(b: any) { const p = PACKAGES.find((p: any) => p.id === b.package_id) || {}; return { ...b, package_name: p.name || '—', package_price: p.price || 0 }; }

// ── Expenses ────────────────────────────────────────────────────────
let EXP_SEQ = 3, EXPCAT_SEQ = 10;
const EXPENSE_CATEGORIES: any[] = [
  { id: 1, name: 'Rent' }, { id: 2, name: 'Utilities' }, { id: 3, name: 'Salaries' }, { id: 4, name: 'Transport' }, { id: 5, name: 'Maintenance' }, { id: 6, name: 'Marketing' },
];
const EXPENSES: any[] = [
  { id: 1, ref: 'EXP-0001', date: '2024-11-05', category_id: 1, location_id: 1, account_id: 2, amount: 600, payment_status: 'paid', expense_for: '', note: 'Shop rent November', is_refund: false },
  { id: 2, ref: 'EXP-0002', date: '2024-11-09', category_id: 2, location_id: 1, account_id: 1, amount: 84.5, payment_status: 'paid', expense_for: '', note: 'Electricity', is_refund: false },
  { id: 3, ref: 'EXP-0003', date: '2024-11-14', category_id: 4, location_id: 2, account_id: 1, amount: 45, payment_status: 'due', expense_for: 'Bashir M.', note: 'Delivery fuel', is_refund: false },
];
function serializeExpense(e: any) {
  return { ...e, category_name: (EXPENSE_CATEGORIES.find((c: any) => c.id === e.category_id) || {}).name || '—', location_name: (LOCATION_LIST.find((l: any) => l.id === e.location_id) || {}).name || '—', account_name: (PAYMENT_ACCOUNTS.find((a: any) => a.id === e.account_id) || {}).name || '—' };
}

// ── Payment accounts (cash / bank / mobile money) ───────────────────
let ACC_SEQ = 10;
const ACCOUNT_TYPES: string[] = ['Cash', 'Bank', 'Mobile money', 'Other'];
const PAYMENT_ACCOUNTS: any[] = [
  { id: 1, name: 'Cash Drawer', type: 'Cash', account_number: '', balance: 2480.50 },
  { id: 2, name: 'Premier Bank', type: 'Bank', account_number: 'PB-00 4471 220', balance: 18640.00 },
  { id: 3, name: 'Zaad Float', type: 'Mobile money', account_number: '+252 61 555 0000', balance: 3920.75 },
];

// ── Restaurant suite (Tables, Service Staff, Modifiers, Kitchen) ────
let TBL_SEQ = 6, STAFF_SEQ = 3, MOD_SEQ = 2, KOT_SEQ = 2;
const TABLES: any[] = [
  { id: 1, name: 'Table 1', location_id: 1, seats: 4, status: 'free' }, { id: 2, name: 'Table 2', location_id: 1, seats: 2, status: 'occupied' },
  { id: 3, name: 'Table 3', location_id: 1, seats: 4, status: 'free' }, { id: 4, name: 'Table 4', location_id: 1, seats: 6, status: 'occupied' },
  { id: 5, name: 'Patio 1', location_id: 1, seats: 4, status: 'free' }, { id: 6, name: 'Counter', location_id: 2, seats: 2, status: 'free' },
];
const SERVICE_STAFF: any[] = [
  { id: 1, name: 'Yusuf Omar', pin: '1234', location_id: 1 }, { id: 2, name: 'Sahra Jama', pin: '5678', location_id: 1 }, { id: 3, name: 'Cali Daud', pin: '4321', location_id: 2 },
];
const MODIFIER_SETS: any[] = [
  { id: 1, name: 'Add-ons', options: [{ name: 'Extra cheese', price: 1.0 }, { name: 'Extra sauce', price: 0.5 }, { name: 'Double meat', price: 2.5 }] },
  { id: 2, name: 'Spice level', options: [{ name: 'Mild', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Hot', price: 0 }] },
];
const KITCHEN_ORDERS: any[] = [
  { id: 1, table: 'Table 2', staff: 'Yusuf Omar', items: [{ name: 'Beef Suqaar', qty: 2 }, { name: 'Somali Tea (Shaah)', qty: 2 }], status: 'preparing', time: '14:22' },
  { id: 2, table: 'Table 4', staff: 'Sahra Jama', items: [{ name: 'Grilled Fish', qty: 1 }, { name: 'Rice', qty: 1 }, { name: 'Mango Juice 1L', qty: 2 }], status: 'ready', time: '14:10' },
];
function regTotals0() { return { cash: 0, zaad: 0, evc: 0, card: 0, bank: 0, advance: 0 }; }
function serializeRegister(r: any) {
  const total_payments = +Object.values(r.totals).reduce((a: any, b: any) => a + b, 0).toFixed(2);
  return { ...r, total_payments, expected_cash: +(r.opening_cash + (r.totals.cash || 0) - (r.refunds || 0)).toFixed(2) };
}
function logToRegister(method: any, amount: any) {
  if (!CURRENT_REGISTER) return;
  if (CURRENT_REGISTER.totals[method] == null) CURRENT_REGISTER.totals[method] = 0;
  CURRENT_REGISTER.totals[method] += amount;
  CURRENT_REGISTER.total_sales += amount;
  CURRENT_REGISTER.tx_count += 1;
}
function serializeUser(u: any) {
  const r = ROLES.find((r: any) => r.id === u.role_id);
  return { ...u, role_name: r ? r.name : '—', locations: u.location_access === 'all' ? 'All locations' : LOCATION_LIST.filter((l: any) => (u.location_access || []).includes(l.id)).map((l: any) => l.name).join(', ') };
}
function serializeRole(r: any) {
  return { ...r, permission_count: r.permissions === 'all' ? ALL_PERMS.length : r.permissions.length, total_permissions: ALL_PERMS.length, user_count: USERS_DATA.filter((u: any) => u.role_id === r.id).length };
}
function serializeLocation(l: any) {
  return {
    ...l,
    scheme_name: (INVOICE_SCHEMES.find((s: any) => s.id === l.invoice_scheme_id) || {}).name || '—',
    layout_name: (INVOICE_LAYOUTS.find((x: any) => x.id === l.invoice_layout_id) || {}).name || '—',
    price_group_name: (SELLING_PRICE_GROUPS.find((g: any) => g.id === l.price_group_id) || {}).name || 'Default',
  };
}
function contactDue(c: any) {
  // amount the customer owes us (sales + opening − paid − advance), clamped sensible for demo
  const sales = (c.total_sale || 0) + (c.opening_balance || 0);
  const paid = (c.total_paid || 0) + (c.advance_balance || 0) + PAYMENTS.filter((p: any) => p.contact_id === c.id && p.kind === 'receive').reduce((s: any, p: any) => s + p.amount, 0);
  return Math.max(0, +(sales - paid).toFixed(2));
}
function supplierDue(c: any) {
  const purch = (c.total_purchase || 0);
  const paid = (c.total_paid_supplier ?? c.total_paid ?? 0) + PAYMENTS.filter((p: any) => p.contact_id === c.id && p.kind === 'pay').reduce((s: any, p: any) => s + p.amount, 0);
  return Math.max(0, +(purch - paid).toFixed(2));
}
function serializeContact(c: any) {
  return {
    ...c,
    due: c.type === 'supplier' ? supplierDue(c) : contactDue(c),
    group_name: (CUSTOMER_GROUPS.find((g: any) => g.id === c.customer_group_id) || {}).name || 'None',
  };
}

// Persistent ledger: created sells + returns. Stock deltas are derived
// from it so a reload replays to the exact same state.
const LEDGER: any = (() => {
  let l: any = {};
  try { l = JSON.parse(lsGet('bz_ledger') || '{}'); } catch (e) {}
  return { sells: l.sells || [], invoiceSeq: l.invoiceSeq || 0 };
})();
function persistLedger() { lsSet('bz_ledger', JSON.stringify(LEDGER)); }

// Replay the ledger onto the in-memory globals (stock + Sales list) once
// at boot so the rest of the app (which reads the globals) stays in sync.
function replayLedger() {
  LEDGER.sells.forEach((s: any) => {
    s.lines.forEach((ln: any) => {
      const p = PRODUCTS.find((p: any) => numId(p.id) === ln.product_id);
      if (!p) return;
      p.stock -= ln.qty;                              // sale removed stock
      if (ln.returned) p.stock += ln.returned;        // returns restocked (partial or full)
    });
    if (!SALES.find((x: any) => x.id === s.invoice_no)) {
      SALES.unshift({
        id: s.invoice_no, customer: s.customer || 'Walk-in', cashier: 'Amina Y.',
        method: s.method, methodLabel: (PAYMENT_METHODS.find((m: any) => m.id === s.method) || {}).label || 'Cash',
        items: s.lines.reduce((a: any, l: any) => a + l.qty, 0), total: s.final_total,
        minsAgo: Math.max(0, Math.round((Date.now() - s.t) / 60000)),
        status: s.status === 'refunded' ? 'refunded' : 'completed',
        _txn: true, _id: s.id,
      });
    }
  });
}

// ── Serializers: our shop record  →  UltimatePOS shape ──────────────
function upsProduct(p: any) {
  const id = numId(p.id);
  return {
    id, name: p.name, sku: p.sku, type: 'single',
    enable_stock: 1, unit_id: 1, unit: p.unit,
    category_id: CAT_NUM[p.cat] || null, brand_id: null, tax_id: null,
    image_url: p.img || '', product_description: null,
    product_variations: [{
      id: 1000 + id, name: 'DUMMY', is_dummy: 1, variations: [{
        id, name: 'DUMMY', sub_sku: p.sku,
        default_purchase_price: f4(p.cost), dpp_inc_tax: f4(p.cost),
        default_sell_price: f4(p.price), sell_price_inc_tax: f4(p.price),
        variation_location_details: [{ location_id: 1, qty_available: String(p.stock) }],
      }],
    }],
    // mock-only convenience so the UI keeps its rich local fields with no loss.
    _view: p,
  };
}

function upsSell(s: any) {
  return {
    id: s.id, business_id: 1, location_id: s.location_id, type: 'sell',
    status: 'final', payment_status: s.payment_status || 'paid', contact_id: s.contact_id,
    amount_paid: f4(s.amount_paid != null ? s.amount_paid : s.final_total), change_return: f4(s.change_return || 0),
    invoice_no: s.invoice_no, transaction_date: s.date,
    total_before_tax: f4(s.subtotal), tax_amount: f4(s.tax),
    discount_type: s.discount_type, discount_amount: f4(s.discount_amount),
    final_total: f4(s.final_total), is_created_from_api: 1,
    sell_lines: s.lines.map((ln: any, i: any) => ({
      id: s.id * 100 + i, transaction_id: s.id, product_id: ln.product_id,
      variation_id: ln.product_id, quantity: ln.qty, quantity_returned: ln.returned || 0,
      unit_price: f4(ln.unit_price), unit_price_inc_tax: f4(ln.unit_price),
      line_total: f4(ln.unit_price * ln.qty),
    })),
    payments: s.payments,
    invoice_url: (API_CONFIG.baseUrl || 'http://local.pos.com') + '/invoice/' + s.invoice_no,
  };
}

// Build / update a PRODUCTS record from an editor view-model.
function syncCategoryCounts() {
  CATEGORIES.forEach((c: any) => { c.count = c.id === 'all' ? PRODUCTS.length : PRODUCTS.filter((p: any) => p.cat === c.id).length; });
}
function writeProduct(existing: any, body: any) {
  const type = body.type || 'single';
  const base: any = {
    ...(existing || {}),
    id: existing ? existing.id : 'p' + Date.now(),
    name: body.name, sku: body.sku || autoSku(body.sku_prefix), cat: body.cat, unit: body.unit,
    sw: body.sw || (existing && existing.sw) || '#D9C9A3', img: body.img ?? (existing ? existing.img : null),
    type, brand_id: body.brand_id ?? null, tax_id: body.tax_id ?? 0,
    alert_quantity: Number(body.alert_quantity || 0),
    group_prices: body.group_prices || (existing && existing.group_prices) || {},
    not_for_selling: !!body.not_for_selling, enable_stock: body.enable_stock !== false,
    rx: body.rx ?? (existing ? existing.rx : false),
  };
  if (type === 'variable') {
    const vs = (body.variations || []).map((v: any) => ({ name: v.name, sku: v.sku || '', cost: Number(v.cost || 0), price: Number(v.price || 0), stock: Number(v.stock || 0) }));
    base.variations = vs;
    base.price = vs.length ? Math.min(...vs.map((v: any) => v.price)) : 0;
    base.cost = vs.length ? Math.min(...vs.map((v: any) => v.cost)) : 0;
    base.stock = base.enable_stock ? vs.reduce((s: any, v: any) => s + v.stock, 0) : Infinity;
    delete base.combo;
  } else if (type === 'combo') {
    const items = (body.combo || []).map((c: any) => ({ product_id: numId(c.product_id), qty: Number(c.qty || 1) }));
    base.combo = items;
    base.price = Number(body.price || 0);
    base.cost = items.reduce((s: any, it: any) => { const p = PRODUCTS.find((p: any) => numId(p.id) === it.product_id); return s + (p ? p.cost * it.qty : 0); }, 0);
    base.stock = items.length ? Math.min(...items.map((it: any) => { const p = PRODUCTS.find((p: any) => numId(p.id) === it.product_id); return p ? Math.floor(p.stock / it.qty) : 0; })) : 0;
    delete base.variations;
  } else {
    base.price = Number(body.price || 0); base.cost = Number(body.cost || 0);
    base.stock = body.enable_stock === false ? Infinity : Number(body.stock || 0);
    delete base.variations; delete base.combo;
  }
  return base;
}
function autoSku(prefix: any) {
  const n = String(Math.floor(Math.random() * 9000) + 1000);
  return (prefix ? prefix.toUpperCase() + '-' : '') + '0' + n;
}

// Stock availability + deduction that understands combos and variations.
function comboStock(p: any) {
  return Math.min(...(p.combo || []).map((it: any) => { const cp = PRODUCTS.find((x: any) => numId(x.id) === it.product_id); return cp ? Math.floor(cp.stock / it.qty) : 0; }));
}
function availStock(p: any, variation?: any) {
  if (p.enable_stock === false) return Infinity;
  if (p.combo && p.combo.length) return comboStock(p);
  if (variation && p.variations) { const v = p.variations.find((v: any) => v.name === variation); return v ? v.stock : 0; }
  return p.stock;
}
function deductStock(p: any, variation: any, qty: any) {
  if (p.enable_stock === false) return;
  if (p.combo && p.combo.length) {
    p.combo.forEach((it: any) => { const cp = PRODUCTS.find((x: any) => numId(x.id) === it.product_id); if (cp && cp.enable_stock !== false) cp.stock -= it.qty * qty; });
    p.stock = comboStock(p);
    return;
  }
  if (variation && p.variations) { const v = p.variations.find((v: any) => v.name === variation); if (v) v.stock -= qty; p.stock = p.variations.reduce((s: any, x: any) => s + x.stock, 0); return; }
  p.stock -= qty;
}

// Laravel-style paginated envelope
function paginate(rows: any[], path: string, perPage = 50, page = 1) {
  const total = rows.length, lastPage = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage;
  return {
    data: rows.slice(from, from + perPage),
    links: {
      first: `${path}?page=1`, last: `${path}?page=${lastPage}`,
      prev: page > 1 ? `${path}?page=${page - 1}` : null,
      next: page < lastPage ? `${path}?page=${page + 1}` : null,
    },
    meta: { current_page: page, from: from + 1, last_page: lastPage, path, per_page: perPage, to: Math.min(from + perPage, total), total },
  };
}

// ── Mock route table ────────────────────────────────────────────────
function route(method: string, pattern: string, handler: any): any {
  const keys: string[] = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return {
    method, handler,
    test: (path: string) => rx.test(path.split('?')[0]),
    params: (path: string) => { const m: any = rx.exec(path.split('?')[0]) || []; const o: any = {}; keys.forEach((k, i) => o[k] = m[i + 1]); return o; },
  };
}

const MOCK_ROUTES: any[] = [
  // OAuth2 password grant  →  POST /oauth/token
  route('POST', '/oauth/token', ({ body }: any) => {
    const ok = (body.username || '').trim() && (body.password || '').length >= 4;
    if (!ok) throw new ApiError(401, 'The user credentials were incorrect.');
    return {
      token_type: 'Bearer',
      expires_in: 31536000,
      access_token: 'mock.' + btoa(body.username + ':' + Date.now()).replace(/=/g, ''),
      refresh_token: 'mock-refresh.' + Date.now(),
    };
  }),

  // ── Business locations  /connector/api/business-location ──────────
  route('GET', '/connector/api/business-location', () => ({ data: LOCATION_LIST.map(serializeLocation) })),
  route('GET', '/connector/api/business-location/:id', ({ params }: any) => {
    const l = LOCATION_LIST.find((l: any) => l.id === Number(params.id)); if (!l) throw new ApiError(404, 'Location not found');
    return { data: [serializeLocation(l)] };
  }),
  route('POST', '/connector/api/business-location', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Location name is required.');
    const id = ++LOC_SEQ;
    const l = {
      id, name: body.name.trim(), type: body.type || 'Retail', landmark: body.landmark || '', city: body.city || '', mobile: body.mobile || '', manager: body.manager || '',
      invoice_scheme_id: Number(body.invoice_scheme_id) || 1, invoice_layout_id: Number(body.invoice_layout_id) || 1, price_group_id: Number(body.price_group_id) || 0,
      payment_methods: body.payment_methods || ['cash'], default_payment: body.default_payment || 'cash', status: 'active', sales: 0, stock: 0,
    };
    LOCATION_LIST.push(l); return { data: serializeLocation(l) };
  }),
  route('PUT', '/connector/api/business-location/:id', ({ params, body }: any) => {
    const l = LOCATION_LIST.find((l: any) => l.id === Number(params.id)); if (!l) throw new ApiError(404, 'Location not found');
    Object.assign(l, {
      name: body.name ?? l.name, type: body.type ?? l.type, landmark: body.landmark ?? l.landmark, city: body.city ?? l.city, mobile: body.mobile ?? l.mobile, manager: body.manager ?? l.manager,
      invoice_scheme_id: body.invoice_scheme_id != null ? Number(body.invoice_scheme_id) : l.invoice_scheme_id,
      invoice_layout_id: body.invoice_layout_id != null ? Number(body.invoice_layout_id) : l.invoice_layout_id,
      price_group_id: body.price_group_id != null ? Number(body.price_group_id) : l.price_group_id,
      payment_methods: body.payment_methods ?? l.payment_methods, default_payment: body.default_payment ?? l.default_payment,
    });
    return { data: serializeLocation(l) };
  }),
  route('PUT', '/connector/api/business-location/:id/status', ({ params, body }: any) => {
    const l = LOCATION_LIST.find((l: any) => l.id === Number(params.id)); if (!l) throw new ApiError(404, 'Location not found');
    if (body.status === 'inactive' && LOCATION_LIST.filter((x: any) => x.status === 'active').length === 1 && l.status === 'active')
      throw new ApiError(422, 'At least one location must stay active.');
    l.status = body.status;
    return { data: serializeLocation(l) };
  }),
  route('GET', '/connector/api/invoice-scheme', () => ({ data: INVOICE_SCHEMES })),
  route('POST', '/connector/api/invoice-scheme', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Scheme name is required.');
    const s = { id: ++SCHEME_SEQ, name: body.name.trim(), prefix: body.prefix || '', number_type: 'sequential', start_number: Number(body.start_number || 1), total_digits: Number(body.total_digits || 4), is_default: false };
    INVOICE_SCHEMES.push(s); return { data: s };
  }),
  route('GET', '/connector/api/invoice-layout', () => ({ data: INVOICE_LAYOUTS })),
  route('POST', '/connector/api/invoice-layout', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Layout name is required.');
    const l = { id: ++LAYOUT_SEQ, name: body.name.trim(), is_default: false, design: body.design || 'classic', header_text: body.header_text || '', show_address: body.show_address !== false, show_tax_summary: !!body.show_tax_summary, show_total_in_words: !!body.show_total_in_words, show_discount: body.show_discount !== false, hide_prices: !!body.hide_prices, show_qr: !!body.show_qr, show_letterhead: !!body.show_letterhead, footer_text: body.footer_text || '' };
    INVOICE_LAYOUTS.push(l); return { data: l };
  }),
  route('PUT', '/connector/api/invoice-layout/:id', ({ params, body }: any) => {
    const l = INVOICE_LAYOUTS.find((x: any) => x.id === Number(params.id)); if (!l) throw new ApiError(404, 'Layout not found');
    if (body.is_default) INVOICE_LAYOUTS.forEach((x: any) => x.is_default = false);
    Object.assign(l, body); return { data: l };
  }),
  route('DELETE', '/connector/api/invoice-layout/:id', ({ params }: any) => {
    const i = INVOICE_LAYOUTS.findIndex((x: any) => x.id === Number(params.id)); if (i < 0) throw new ApiError(404);
    if (INVOICE_LAYOUTS[i].is_default) throw new ApiError(422, 'The default layout cannot be deleted.');
    INVOICE_LAYOUTS.splice(i, 1); return { data: { deleted: true } };
  }),
  route('GET', '/connector/api/selling-price-group', () => ({ data: SELLING_PRICE_GROUPS })),
  route('POST', '/connector/api/selling-price-group', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Price group name is required.');
    const g = { id: ++PRICE_GROUP_SEQ, name: body.name.trim(), percent: Number(body.percent || 0) };
    SELLING_PRICE_GROUPS.push(g); return { data: g };
  }),
  route('DELETE', '/connector/api/selling-price-group/:id', ({ params }: any) => {
    const i = SELLING_PRICE_GROUPS.findIndex((g: any) => g.id === Number(params.id));
    if (i < 0) throw new ApiError(404); if (SELLING_PRICE_GROUPS[i].is_default) throw new ApiError(422, 'The default price group cannot be deleted.');
    SELLING_PRICE_GROUPS.splice(i, 1); return { data: { deleted: true } };
  }),
  route('GET', '/connector/api/payment-method', () => ({ data: PAYMENT_METHOD_KEYS })),

  // ── Purchases  /connector/api/purchase ────────────────────────────
  route('GET', '/connector/api/purchase', () => ({ data: PURCHASES.slice().reverse().map(serializePurchase) })),
  route('GET', '/connector/api/purchase/:id', ({ params }: any) => {
    const p = PURCHASES.find((p: any) => p.id === Number(params.id)); if (!p) throw new ApiError(404, 'Purchase not found');
    return { data: [serializePurchase(p)] };
  }),
  route('POST', '/connector/api/purchase', ({ body }: any) => {
    if (!body.supplier_id) throw new ApiError(422, 'Select a supplier.');
    const lines = (body.lines || []).filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!lines.length) throw new ApiError(422, 'Add at least one product with a quantity.');
    PURCHASE_SEQ += 1;
    const rec: any = {
      id: PURCHASE_SEQ, ref_no: 'PO2024-' + String(PURCHASE_SEQ).padStart(4, '0'),
      supplier_id: Number(body.supplier_id), location_id: Number(body.location_id) || 1,
      date: body.date || new Date().toISOString().slice(0, 10), status: body.status || 'received',
      payment_status: 'due', discount: Number(body.discount || 0), tax: Number(body.tax || 0),
      paid: Number(body.paid || 0),
      lines: lines.map((l: any) => ({ product_id: numId(l.product_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost || 0) })),
    };
    const total = purchaseTotal(rec);
    rec.payment_status = rec.paid >= total ? 'paid' : rec.paid > 0 ? 'partial' : 'due';
    if (rec.status === 'received') rec.lines.forEach((l: any) => { const p = PRODUCTS.find((p: any) => numId(p.id) === l.product_id); if (p) addStock(p, null, l.qty); });
    const sup = CONTACTS.find((c: any) => c.id === rec.supplier_id);
    if (sup) { sup.total_purchase = (sup.total_purchase || 0) + total; sup.total_paid_supplier = (sup.total_paid_supplier ?? sup.total_paid ?? 0) + rec.paid; }
    syncCategoryCounts();
    PURCHASES.push(rec);
    return { data: serializePurchase(rec) };
  }),

  // POST /connector/api/opening-stock
  route('POST', '/connector/api/opening-stock', ({ body }: any) => {
    const p = PRODUCTS.find((p: any) => numId(p.id) === numId(body.product_id));
    if (!p) throw new ApiError(404, 'Product not found');
    if (p.enable_stock === false) throw new ApiError(422, 'This product does not manage stock.');
    addStock(p, body.variation || null, Number(body.qty || 0));
    return { data: { product_id: numId(p.id), stock: p.stock } };
  }),

  // ── Business registration (web form, not connector API) ───────────
  route('GET', '/business/currencies', () => ({ data: CURRENCIES })),
  route('GET', '/business/timezones', () => ({ data: TIMEZONES })),

  route('POST', '/business/register', ({ body }: any) => {
    const b = body.business || {}, u = body.user || {};
    if (!String(b.name || '').trim()) throw new ApiError(422, 'Business name is required.', { field: 'name' });
    if (!String(u.name || '').trim()) throw new ApiError(422, 'Your name is required.', { field: 'user_name' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email || '')) throw new ApiError(422, 'Enter a valid email address.', { field: 'email' });
    const domain = String(u.email).split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(domain)) throw new ApiError(422, 'Disposable email addresses are not allowed. Use a permanent email.', { field: 'email' });
    if (!/^[a-z0-9_.]{4,}$/i.test(u.username || '')) throw new ApiError(422, 'Username must be at least 4 characters (letters, numbers, _ .).', { field: 'username' });
    if (String(u.password || '').length < 6) throw new ApiError(422, 'Password must be at least 6 characters.', { field: 'password' });
    if (REGISTERED_USERNAMES.includes(String(u.username).toLowerCase())) throw new ApiError(409, 'That username is already taken.', { field: 'username' });
    REGISTERED_USERNAMES.push(String(u.username).toLowerCase());
    return {
      data: {
        business_id: 1000 + REGISTERED_USERNAMES.length,
        name: b.name, username: u.username, role: 'Admin',
        message: 'Business registered. You can now sign in with your username and password.',
      },
    };
  }),

  // ── Contacts  /connector/api/contactapi ───────────────────────────
  route('GET', '/connector/api/contactapi', ({ query }: any) => {
    let rows = CONTACTS.slice();
    if (query.type === 'customer') rows = rows.filter((c: any) => c.type === 'customer' || c.type === 'both');
    else if (query.type === 'supplier') rows = rows.filter((c: any) => c.type === 'supplier' || c.type === 'both');
    if (query.name) { const q = String(query.name).toLowerCase(); rows = rows.filter((c: any) => c.name.toLowerCase().includes(q) || (c.mobile || '').includes(query.name) || c.contact_id.toLowerCase().includes(q)); }
    return { data: rows.map(serializeContact) };
  }),
  route('GET', '/connector/api/contactapi/:id', ({ params }: any) => {
    const c = CONTACTS.find((c: any) => c.id === Number(params.id));
    if (!c) throw new ApiError(404, 'Contact not found');
    return { data: [serializeContact(c)] };
  }),
  route('POST', '/connector/api/contactapi', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Contact name is required.');
    const type = body.type || 'customer';
    const prefix = type === 'supplier' ? 'SP' : type === 'both' ? 'CT' : 'CO';
    const id = ++CONTACT_SEQ;
    const c = {
      id, type, name: body.name.trim(), contact_id: prefix + String(id).padStart(4, '0'),
      mobile: body.mobile || '', email: body.email || '', address: body.address || '', tax_number: body.tax_number || '',
      customer_group_id: Number(body.customer_group_id) || 0,
      pay_term_number: body.pay_term_number ? Number(body.pay_term_number) : null, pay_term_type: body.pay_term_type || 'days',
      credit_limit: body.credit_limit === '' || body.credit_limit == null ? null : Number(body.credit_limit),
      opening_balance: Number(body.opening_balance || 0), advance_balance: Number(body.advance_balance || 0),
      total_sale: 0, total_paid: 0, total_purchase: 0,
    };
    CONTACTS.push(c);
    return { data: serializeContact(c) };
  }),
  route('PUT', '/connector/api/contactapi/:id', ({ params, body }: any) => {
    const c = CONTACTS.find((c: any) => c.id === Number(params.id));
    if (!c) throw new ApiError(404, 'Contact not found');
    Object.assign(c, {
      name: body.name ?? c.name, type: body.type ?? c.type, mobile: body.mobile ?? c.mobile, email: body.email ?? c.email,
      address: body.address ?? c.address, tax_number: body.tax_number ?? c.tax_number,
      customer_group_id: body.customer_group_id != null ? Number(body.customer_group_id) : c.customer_group_id,
      pay_term_number: body.pay_term_number ? Number(body.pay_term_number) : c.pay_term_number, pay_term_type: body.pay_term_type ?? c.pay_term_type,
      credit_limit: body.credit_limit === '' ? null : (body.credit_limit != null ? Number(body.credit_limit) : c.credit_limit),
      opening_balance: body.opening_balance != null ? Number(body.opening_balance) : c.opening_balance,
    });
    return { data: serializeContact(c) };
  }),
  route('DELETE', '/connector/api/contactapi/:id', ({ params }: any) => {
    const i = CONTACTS.findIndex((c: any) => c.id === Number(params.id));
    if (i < 0) throw new ApiError(404, 'Contact not found');
    if (CONTACTS[i].name === 'Walk-in Customer') throw new ApiError(422, "The default customer can't be deleted.");
    CONTACTS.splice(i, 1);
    return { data: { deleted: true } };
  }),

  // GET /connector/api/contactapi/:id/ledger
  route('GET', '/connector/api/contact-ledger/:id', ({ params }: any) => {
    const c = CONTACTS.find((c: any) => c.id === Number(params.id));
    if (!c) throw new ApiError(404, 'Contact not found');
    const isSup = c.type === 'supplier';
    const lines: any[] = [];
    if (c.opening_balance) lines.push({ date: '2024-01-01', type: 'opening_balance', ref: 'Opening Balance', debit: c.opening_balance, credit: 0 });
    const inv = isSup ? (c.total_purchase || 0) : (c.total_sale || 0);
    const paid = isSup ? (c.total_paid_supplier ?? c.total_paid ?? 0) : (c.total_paid || 0);
    if (inv) lines.push({ date: '2024-11-04', type: isSup ? 'purchase' : 'sell', ref: (isSup ? 'PO' : 'INV') + '-' + (1000 + c.id), debit: isSup ? 0 : inv, credit: isSup ? inv : 0 });
    if (paid) lines.push({ date: '2024-11-12', type: 'payment', ref: 'PAY-' + (2000 + c.id), debit: isSup ? paid : 0, credit: isSup ? 0 : paid });
    PAYMENTS.filter((p: any) => p.contact_id === c.id).forEach((p: any) => lines.push({ date: p.date, type: 'payment', ref: p.ref, debit: p.kind === 'pay' ? p.amount : 0, credit: p.kind === 'receive' ? p.amount : 0 }));
    if (c.advance_balance) lines.push({ date: '2024-10-20', type: 'advance', ref: 'Advance', debit: 0, credit: c.advance_balance });
    return { data: { contact: serializeContact(c), ledger: lines } };
  }),

  // POST /connector/api/contact-payment
  route('POST', '/connector/api/contact-payment', ({ body }: any) => {
    const c = CONTACTS.find((c: any) => c.id === Number(body.contact_id));
    if (!c) throw new ApiError(404, 'Contact not found');
    const amount = Number(body.amount || 0);
    if (amount <= 0) throw new ApiError(422, 'Enter an amount greater than 0.');
    const p = { id: PAYMENTS.length + 1, contact_id: c.id, amount, kind: body.kind || 'receive', method: body.method || 'cash', note: body.note || '', date: new Date().toISOString().slice(0, 10), ref: 'PAY-' + (3000 + PAYMENTS.length + 1) };
    PAYMENTS.push(p);
    return { data: { payment: p, contact: serializeContact(c) } };
  }),

  // ── Customer groups  /connector/api/customer-group ────────────────
  route('GET', '/connector/api/customer-group', () => ({ data: CUSTOMER_GROUPS.filter((g: any) => g.id !== 0) })),
  route('POST', '/connector/api/customer-group', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Group name is required.');
    const g = { id: ++CG_SEQ, name: body.name.trim(), amount: Number(body.amount || 0) };
    CUSTOMER_GROUPS.push(g); return { data: g };
  }),
  route('DELETE', '/connector/api/customer-group/:id', ({ params }: any) => {
    const i = CUSTOMER_GROUPS.findIndex((g: any) => g.id === Number(params.id));
    if (i < 0) throw new ApiError(404); CUSTOMER_GROUPS.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Users  /connector/api/user ────────────────────────────────────
  route('GET', '/connector/api/business-location-list', () => ({ data: LOCATION_LIST })),
  route('GET', '/connector/api/permission-list', () => ({ data: PERMISSION_GROUPS })),
  route('GET', '/connector/api/user', () => ({ data: USERS_DATA.map(serializeUser) })),
  route('GET', '/connector/api/user/:id', ({ params }: any) => {
    const u = USERS_DATA.find((u: any) => u.id === Number(params.id)); if (!u) throw new ApiError(404, 'User not found');
    return { data: [serializeUser(u)] };
  }),
  route('POST', '/connector/api/user', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Name is required.');
    if (!/^[a-z0-9_.]{4,}$/i.test(body.username || '')) throw new ApiError(422, 'Username must be at least 4 characters.');
    if (USERS_DATA.some((u: any) => u.username.toLowerCase() === String(body.username).toLowerCase()) || REGISTERED_USERNAMES.includes(String(body.username).toLowerCase())) throw new ApiError(409, 'Username already taken.');
    if (body.allow_login !== false && String(body.password || '').length < 6) throw new ApiError(422, 'Password must be at least 6 characters.');
    const u = {
      id: ++USER_SEQ, name: body.name.trim(), email: body.email || '', username: body.username,
      role_id: Number(body.role_id) || 2, location_access: body.location_access || 'all',
      commission_percent: Number(body.commission_percent || 0), max_discount: body.max_discount === '' || body.max_discount == null ? null : Number(body.max_discount),
      is_active: body.is_active !== false, allow_login: body.allow_login !== false,
    };
    USERS_DATA.push(u); REGISTERED_USERNAMES.push(u.username.toLowerCase());
    return { data: serializeUser(u) };
  }),
  route('PUT', '/connector/api/user/:id', ({ params, body }: any) => {
    const u = USERS_DATA.find((u: any) => u.id === Number(params.id)); if (!u) throw new ApiError(404, 'User not found');
    Object.assign(u, {
      name: body.name ?? u.name, email: body.email ?? u.email, role_id: body.role_id != null ? Number(body.role_id) : u.role_id,
      location_access: body.location_access ?? u.location_access,
      commission_percent: body.commission_percent != null ? Number(body.commission_percent) : u.commission_percent,
      max_discount: body.max_discount === '' ? null : (body.max_discount != null ? Number(body.max_discount) : u.max_discount),
      is_active: body.is_active != null ? body.is_active : u.is_active, allow_login: body.allow_login != null ? body.allow_login : u.allow_login,
    });
    return { data: serializeUser(u) };
  }),
  route('DELETE', '/connector/api/user/:id', ({ params }: any) => {
    const i = USERS_DATA.findIndex((u: any) => u.id === Number(params.id)); if (i < 0) throw new ApiError(404, 'User not found');
    if (USERS_DATA[i].role_id === 1 && USERS_DATA.filter((u: any) => u.role_id === 1).length === 1) throw new ApiError(422, 'Cannot delete the only Admin user.');
    USERS_DATA.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Roles  /connector/api/role ────────────────────────────────────
  route('GET', '/connector/api/role', () => ({ data: ROLES.map(serializeRole) })),
  route('GET', '/connector/api/role/:id', ({ params }: any) => {
    const r = ROLES.find((r: any) => r.id === Number(params.id)); if (!r) throw new ApiError(404, 'Role not found');
    return { data: [{ ...serializeRole(r), permissions: r.permissions === 'all' ? ALL_PERMS.slice() : r.permissions }] };
  }),
  route('POST', '/connector/api/role', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Role name is required.');
    if (ROLES.some((r: any) => r.name.toLowerCase() === String(body.name).toLowerCase())) throw new ApiError(409, 'A role with that name exists.');
    const r = { id: ++ROLE_SEQ, name: body.name.trim(), is_default: false, permissions: body.permissions || [], location_access: body.location_access || 'all' };
    ROLES.push(r); return { data: serializeRole(r) };
  }),
  route('PUT', '/connector/api/role/:id', ({ params, body }: any) => {
    const r = ROLES.find((r: any) => r.id === Number(params.id)); if (!r) throw new ApiError(404, 'Role not found');
    if (r.name === 'Admin') throw new ApiError(422, 'The Admin role always has every permission.');
    Object.assign(r, { name: body.name ?? r.name, permissions: body.permissions ?? r.permissions, location_access: body.location_access ?? r.location_access });
    return { data: serializeRole(r) };
  }),
  route('DELETE', '/connector/api/role/:id', ({ params }: any) => {
    const r = ROLES.find((r: any) => r.id === Number(params.id)); if (!r) throw new ApiError(404, 'Role not found');
    if (r.is_default) throw new ApiError(422, 'Default roles (Admin, Cashier) cannot be deleted.');
    if (USERS_DATA.some((u: any) => u.role_id === r.id)) throw new ApiError(422, 'Reassign users on this role before deleting it.');
    ROLES.splice(ROLES.indexOf(r), 1); return { data: { deleted: true } };
  }),

  // GET /connector/api/product  (list catalog)
  route('GET', '/connector/api/product', ({ query, path }: any) => {
    let rows = PRODUCTS.slice();
    if (query.category_id) rows = rows.filter((p: any) => (CAT_NUM[p.cat] || null) == query.category_id);
    if (query.name) { const q = String(query.name).toLowerCase(); rows = rows.filter((p: any) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)); }
    return paginate(rows.map(upsProduct), '/connector/api/product', Number(query.per_page) || 100, Number(query.page) || 1);
  }),

  // GET /connector/api/product/:id
  route('GET', '/connector/api/product/:id', ({ params }: any) => {
    const p = PRODUCTS.find((p: any) => numId(p.id) === Number(params.id));
    if (!p) throw new ApiError(404, 'Product not found');
    return { data: [upsProduct(p)] };
  }),

  // POST /connector/api/product  (create)
  route('POST', '/connector/api/product', ({ body }: any) => {
    const rec = writeProduct(null, body);
    PRODUCTS.unshift(rec);
    syncCategoryCounts();
    return { data: [upsProduct(rec)] };
  }),

  // PUT /connector/api/product/:id  (update)
  route('PUT', '/connector/api/product/:id', ({ params, body }: any) => {
    const i = PRODUCTS.findIndex((p: any) => numId(p.id) === Number(params.id));
    if (i < 0) throw new ApiError(404, 'Product not found');
    PRODUCTS[i] = writeProduct(PRODUCTS[i], body);
    syncCategoryCounts();
    return { data: [upsProduct(PRODUCTS[i])] };
  }),

  // DELETE /connector/api/product/:id
  route('DELETE', '/connector/api/product/:id', ({ params }: any) => {
    const i = PRODUCTS.findIndex((p: any) => numId(p.id) === Number(params.id));
    if (i < 0) throw new ApiError(404, 'Product not found');
    if (PRODUCTS[i]._hasTxn) throw new ApiError(422, "Product can't be deleted because transactions related to it exist.");
    PRODUCTS.splice(i, 1);
    syncCategoryCounts();
    return { data: { deleted: true } };
  }),

  // ── Units  /connector/api/unit ────────────────────────────────────
  route('GET', '/connector/api/unit', () => ({ data: UNITS })),
  route('POST', '/connector/api/unit', ({ body }: any) => {
    if (!String(body.actual_name || '').trim()) throw new ApiError(422, 'Unit name is required.');
    const u = { id: ++UNIT_SEQ, actual_name: body.actual_name, short_name: body.short_name || body.actual_name, allow_decimal: body.allow_decimal ? 1 : 0, base_unit_id: body.base_unit_id || null, base_unit_multiplier: body.base_unit_multiplier || null };
    UNITS.push(u); return { data: u };
  }),
  route('PUT', '/connector/api/unit/:id', ({ params, body }: any) => {
    const u = UNITS.find((x: any) => x.id === Number(params.id)); if (!u) throw new ApiError(404, 'Unit not found');
    Object.assign(u, { actual_name: body.actual_name, short_name: body.short_name, allow_decimal: body.allow_decimal ? 1 : 0 }); return { data: u };
  }),
  route('DELETE', '/connector/api/unit/:id', ({ params }: any) => {
    const i = UNITS.findIndex((x: any) => x.id === Number(params.id)); if (i < 0) throw new ApiError(404, 'Unit not found');
    UNITS.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Brands  /connector/api/brand ──────────────────────────────────
  route('GET', '/connector/api/brand', () => ({ data: BRANDS })),
  route('POST', '/connector/api/brand', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Brand name is required.');
    const b = { id: ++BRAND_SEQ, name: body.name }; BRANDS.push(b); return { data: b };
  }),
  route('DELETE', '/connector/api/brand/:id', ({ params }: any) => {
    const i = BRANDS.findIndex((x: any) => x.id === Number(params.id)); if (i < 0) throw new ApiError(404);
    BRANDS.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Variation templates  /connector/api/variation ─────────────────
  route('GET', '/connector/api/variation', () => ({ data: VARIATION_TEMPLATES })),
  route('POST', '/connector/api/variation', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Variation name is required.');
    const values = (body.values || []).filter((v: any) => String(v).trim()).map((v: any) => ({ id: ++VARVAL_SEQ, name: v }));
    if (!values.length) throw new ApiError(422, 'Add at least one variation value.');
    const t = { id: ++VAR_SEQ, name: body.name, values }; VARIATION_TEMPLATES.push(t); return { data: t };
  }),
  route('DELETE', '/connector/api/variation/:id', ({ params }: any) => {
    const i = VARIATION_TEMPLATES.findIndex((x: any) => x.id === Number(params.id)); if (i < 0) throw new ApiError(404);
    VARIATION_TEMPLATES.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Tax rates  /connector/api/tax ─────────────────────────────────
  route('GET', '/connector/api/tax', () => ({ data: TAX_RATES })),
  route('GET', '/connector/api/tax-group', () => ({ data: TAX_GROUPS.map(serializeTaxGroup) })),
  route('POST', '/connector/api/tax-group', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Group name is required.');
    if (!(body.tax_ids || []).length) throw new ApiError(422, 'Select at least one tax rate.');
    const g = { id: ++TAXGROUP_SEQ, name: body.name.trim(), tax_ids: body.tax_ids.map(Number) };
    TAX_GROUPS.push(g); return { data: serializeTaxGroup(g) };
  }),
  route('DELETE', '/connector/api/tax-group/:id', ({ params }: any) => { const i = TAX_GROUPS.findIndex((g: any) => g.id === Number(params.id)); if (i < 0) throw new ApiError(404); TAX_GROUPS.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Stock adjustments  /connector/api/stock-adjustment ────────────
  route('GET', '/connector/api/stock-adjustment', () => ({ data: STOCK_ADJUSTMENTS.slice().reverse().map(serializeAdjustment) })),
  route('POST', '/connector/api/stock-adjustment', ({ body }: any) => {
    const lines = (body.lines || []).filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!lines.length) throw new ApiError(422, 'Add at least one product.');
    ADJ_SEQ += 1;
    const a = { id: ADJ_SEQ, ref: 'SA2024-' + String(ADJ_SEQ).padStart(4, '0'), location_id: Number(body.location_id) || 1, date: body.date || new Date().toISOString().slice(0, 10), type: body.type || 'normal', reason: body.reason || '', lines: lines.map((l: any) => ({ product_id: numId(l.product_id), qty: Number(l.qty) })) };
    a.lines.forEach((l: any) => { const p = PRODUCTS.find((p: any) => numId(p.id) === l.product_id); if (p && p.enable_stock !== false) p.stock -= l.qty; });
    syncCategoryCounts();
    STOCK_ADJUSTMENTS.push(a); return { data: serializeAdjustment(a) };
  }),
  route('DELETE', '/connector/api/stock-adjustment/:id', ({ params }: any) => { const i = STOCK_ADJUSTMENTS.findIndex((a: any) => a.id === Number(params.id)); if (i < 0) throw new ApiError(404); STOCK_ADJUSTMENTS.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Reward points  /connector/api/reward-point-setting ────────────
  route('GET', '/connector/api/reward-point-setting', () => ({ data: { ...REWARD_SETTINGS } })),
  route('PUT', '/connector/api/reward-point-setting', ({ body }: any) => { Object.assign(REWARD_SETTINGS, body); return { data: { ...REWARD_SETTINGS } }; }),
  route('GET', '/connector/api/reward-member', () => ({ data: rewardMembers() })),

  // ── Commission agent / Sales representative report ────────────────
  route('GET', '/connector/api/commission-setting', () => ({ data: { ...COMMISSION_SETTINGS } })),
  route('PUT', '/connector/api/commission-setting', ({ body }: any) => { Object.assign(COMMISSION_SETTINGS, body); return { data: { ...COMMISSION_SETTINGS } }; }),
  route('GET', '/connector/api/sales-representative', ({ query }: any) => ({ data: USERS_DATA.map((u: any) => salesRep(u, query.calc || COMMISSION_SETTINGS.calculation_type)) })),
  route('GET', '/connector/api/sales-representative/:id', ({ params, query }: any) => {
    const u = USERS_DATA.find((u: any) => u.id === Number(params.id)); if (!u) throw new ApiError(404, 'User not found');
    return { data: salesRep(u, query.calc || COMMISSION_SETTINGS.calculation_type) };
  }),

  // ── Cash register  /connector/api/cash-register ───────────────────
  route('GET', '/connector/api/cash-register', () => ({ data: CURRENT_REGISTER ? serializeRegister(CURRENT_REGISTER) : null })),
  route('POST', '/connector/api/cash-register', ({ body }: any) => {
    if (CURRENT_REGISTER) throw new ApiError(422, 'A register is already open. Close it first.');
    REGISTER_SEQ += 1;
    const loc = LOCATION_LIST.find((l: any) => l.id === Number(body.location_id)) || LOCATION_LIST[0];
    let cashier = 'Amina Yusuf', shift: any = null;
    if (body.shift_id) { const s = SHIFTS.find((s: any) => s.id === Number(body.shift_id)); if (s) { cashier = empName(s.employee_id); shift = { id: s.id, start: s.start, end: s.end, employee_id: s.employee_id }; } }
    else if (body.employee_id) { cashier = empName(Number(body.employee_id)); }
    CURRENT_REGISTER = { id: REGISTER_SEQ, user_name: cashier, shift, location_id: loc.id, location_name: loc.name, opening_cash: Number(body.opening_cash || 0), opened_at: new Date().toISOString().slice(0, 19).replace('T', ' '), closed_at: null, status: 'open', totals: regTotals0(), refunds: 0, total_sales: 0, tx_count: 0 };
    return { data: serializeRegister(CURRENT_REGISTER) };
  }),
  route('GET', '/connector/api/cash-register/shifts', () => {
    if (!moduleOn('hrm')) return { data: [] };
    const today = new Date().toISOString().slice(0, 10);
    return { data: SHIFTS.filter((s: any) => s.date === today).map(serializeShift) };
  }),
  route('POST', '/connector/api/cash-register/:id/close', ({ params, body }: any) => {
    if (!CURRENT_REGISTER || CURRENT_REGISTER.id !== Number(params.id)) throw new ApiError(404, 'No matching open register.');
    CURRENT_REGISTER.status = 'closed'; CURRENT_REGISTER.closed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    CURRENT_REGISTER.closing = { total_cash: Number(body.total_cash || 0), total_card: Number(body.total_card || 0), total_cheque: Number(body.total_cheque || 0), note: body.note || '' };
    const closed = serializeRegister(CURRENT_REGISTER);
    REGISTERS.unshift(CURRENT_REGISTER);
    CURRENT_REGISTER = null;
    return { data: closed };
  }),
  route('GET', '/connector/api/cash-register-report', () => ({ data: REGISTERS.map(serializeRegister) })),

  // ── Parked orders  /connector/api/held-sale ───────────────────────
  route('GET', '/connector/api/held-sale', ({ query }: any) => ({ data: HELD_SALES.filter((h: any) => !query.type || h.type === query.type).map(serializeHeld) })),
  route('POST', '/connector/api/held-sale', ({ body }: any) => {
    HELD_SEQ += 1;
    const prefix = body.type === 'quotation' ? 'QT' : body.type === 'draft' ? 'DR' : 'HS';
    const h = { id: HELD_SEQ, ref: prefix + String(1000 + HELD_SEQ), type: body.type || 'suspended', customer_id: body.customer_id || null, customer_name: body.customer_name || 'Walk-in', cart: body.cart || [], total: Number(body.total || 0), note: body.note || '', created_at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    HELD_SALES.unshift(h);
    return { data: serializeHeld(h) };
  }),
  route('DELETE', '/connector/api/held-sale/:id', ({ params }: any) => {
    const i = HELD_SALES.findIndex((h: any) => h.id === Number(params.id)); if (i < 0) throw new ApiError(404, 'Parked order not found');
    HELD_SALES.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Stock transfers  /connector/api/stock-transfer ────────────────
  route('GET', '/connector/api/stock-transfer', () => ({ data: TRANSFERS.slice().reverse().map(serializeTransfer) })),
  route('GET', '/connector/api/stock-transfer/:id', ({ params }: any) => {
    const t = TRANSFERS.find((t: any) => t.id === Number(params.id)); if (!t) throw new ApiError(404, 'Transfer not found');
    return { data: [serializeTransfer(t)] };
  }),
  route('POST', '/connector/api/stock-transfer', ({ body }: any) => {
    if (!body.from_location_id || !body.to_location_id) throw new ApiError(422, 'Select both locations.');
    if (Number(body.from_location_id) === Number(body.to_location_id)) throw new ApiError(422, 'From and To locations must differ.');
    const lines = (body.lines || []).filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!lines.length) throw new ApiError(422, 'Add at least one product.');
    TRANSFER_SEQ += 1;
    const t = { id: TRANSFER_SEQ, ref: 'ST2024-' + String(TRANSFER_SEQ).padStart(4, '0'), from_location_id: Number(body.from_location_id), to_location_id: Number(body.to_location_id), date: body.date || new Date().toISOString().slice(0, 10), status: body.status || 'pending', lines: lines.map((l: any) => ({ product_id: numId(l.product_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost || 0) })) };
    TRANSFERS.push(t);
    return { data: serializeTransfer(t) };
  }),
  route('PUT', '/connector/api/stock-transfer/:id/status', ({ params, body }: any) => {
    const t = TRANSFERS.find((t: any) => t.id === Number(params.id)); if (!t) throw new ApiError(404, 'Transfer not found');
    if (t.status === 'completed') throw new ApiError(422, 'A completed transfer cannot be changed.');
    t.status = body.status;
    return { data: serializeTransfer(t) };
  }),
  route('DELETE', '/connector/api/stock-transfer/:id', ({ params }: any) => {
    const i = TRANSFERS.findIndex((t: any) => t.id === Number(params.id)); if (i < 0) throw new ApiError(404, 'Transfer not found');
    TRANSFERS.splice(i, 1); return { data: { deleted: true } };
  }),

  // ── Purchase orders  /connector/api/purchase-order ────────────────
  route('GET', '/connector/api/purchase-order', () => ({ data: PURCHASE_ORDER_DOCS.slice().reverse().map(serializePO) })),
  route('GET', '/connector/api/purchase-order/:id', ({ params }: any) => { const o = PURCHASE_ORDER_DOCS.find((o: any) => o.id === Number(params.id)); if (!o) throw new ApiError(404); return { data: [serializePO(o)] }; }),
  route('POST', '/connector/api/purchase-order', ({ body }: any) => {
    if (!body.supplier_id) throw new ApiError(422, 'Select a supplier.');
    const lines = (body.lines || []).filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!lines.length) throw new ApiError(422, 'Add at least one product.');
    PO_SEQ += 1;
    const o = { id: PO_SEQ, ref: 'PO-' + String(PO_SEQ).padStart(4, '0'), supplier_id: Number(body.supplier_id), location_id: Number(body.location_id) || 1, date: body.date || new Date().toISOString().slice(0, 10), status: 'ordered', lines: lines.map((l: any) => ({ product_id: numId(l.product_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost || 0) })) };
    PURCHASE_ORDER_DOCS.push(o); return { data: serializePO(o) };
  }),
  route('PUT', '/connector/api/purchase-order/:id/status', ({ params, body }: any) => { const o = PURCHASE_ORDER_DOCS.find((o: any) => o.id === Number(params.id)); if (!o) throw new ApiError(404); o.status = body.status; return { data: serializePO(o) }; }),
  route('DELETE', '/connector/api/purchase-order/:id', ({ params }: any) => { const i = PURCHASE_ORDER_DOCS.findIndex((o: any) => o.id === Number(params.id)); if (i < 0) throw new ApiError(404); PURCHASE_ORDER_DOCS.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Sales orders  /connector/api/sales-order ──────────────────────
  route('GET', '/connector/api/sales-order', () => ({ data: SALES_ORDER_DOCS.slice().reverse().map(serializeSO) })),
  route('GET', '/connector/api/sales-order/:id', ({ params }: any) => { const o = SALES_ORDER_DOCS.find((o: any) => o.id === Number(params.id)); if (!o) throw new ApiError(404); return { data: [serializeSO(o)] }; }),
  route('POST', '/connector/api/sales-order', ({ body }: any) => {
    if (!body.contact_id) throw new ApiError(422, 'Select a customer.');
    const lines = (body.lines || []).filter((l: any) => l.product_id && Number(l.qty) > 0);
    if (!lines.length) throw new ApiError(422, 'Add at least one product.');
    SO_SEQ += 1;
    const o = { id: SO_SEQ, ref: 'SO-' + String(SO_SEQ).padStart(4, '0'), contact_id: Number(body.contact_id), location_id: Number(body.location_id) || 1, date: body.date || new Date().toISOString().slice(0, 10), status: 'ordered', lines: lines.map((l: any) => ({ product_id: numId(l.product_id), qty: Number(l.qty), unit_price: Number(l.unit_price || 0) })) };
    SALES_ORDER_DOCS.push(o); return { data: serializeSO(o) };
  }),
  route('PUT', '/connector/api/sales-order/:id/status', ({ params, body }: any) => { const o = SALES_ORDER_DOCS.find((o: any) => o.id === Number(params.id)); if (!o) throw new ApiError(404); o.status = body.status; return { data: serializeSO(o) }; }),
  route('DELETE', '/connector/api/sales-order/:id', ({ params }: any) => { const i = SALES_ORDER_DOCS.findIndex((o: any) => o.id === Number(params.id)); if (i < 0) throw new ApiError(404); SALES_ORDER_DOCS.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Discounts  /connector/api/discount ────────────────────────────
  route('GET', '/connector/api/discount', () => ({ data: DISCOUNTS.map(serializeDiscount) })),
  route('POST', '/connector/api/discount', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Discount name is required.');
    DISCOUNT_SEQ += 1;
    const d = { id: DISCOUNT_SEQ, name: body.name.trim(), brand_id: body.brand_id || null, category: body.category || null, location_id: body.location_id || null, priority: Number(body.priority || 1), type: body.type || 'percentage', value: Number(body.value || 0), starts_at: body.starts_at || '', ends_at: body.ends_at || '', apply_price_groups: !!body.apply_price_groups, apply_customer_groups: !!body.apply_customer_groups, is_active: body.is_active !== false };
    DISCOUNTS.push(d); return { data: serializeDiscount(d) };
  }),
  route('PUT', '/connector/api/discount/:id', ({ params, body }: any) => {
    const d = DISCOUNTS.find((d: any) => d.id === Number(params.id)); if (!d) throw new ApiError(404);
    Object.assign(d, { name: body.name ?? d.name, brand_id: body.brand_id !== undefined ? body.brand_id : d.brand_id, category: body.category !== undefined ? body.category : d.category, location_id: body.location_id !== undefined ? body.location_id : d.location_id, priority: body.priority != null ? Number(body.priority) : d.priority, type: body.type ?? d.type, value: body.value != null ? Number(body.value) : d.value, starts_at: body.starts_at ?? d.starts_at, ends_at: body.ends_at ?? d.ends_at, apply_price_groups: body.apply_price_groups != null ? body.apply_price_groups : d.apply_price_groups, apply_customer_groups: body.apply_customer_groups != null ? body.apply_customer_groups : d.apply_customer_groups, is_active: body.is_active != null ? body.is_active : d.is_active });
    return { data: serializeDiscount(d) };
  }),
  route('DELETE', '/connector/api/discount/:id', ({ params }: any) => { const i = DISCOUNTS.findIndex((d: any) => d.id === Number(params.id)); if (i < 0) throw new ApiError(404); DISCOUNTS.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Types of service  /connector/api/types-of-service ─────────────
  route('GET', '/connector/api/types-of-service', () => ({ data: moduleOn('restaurant') ? TYPES_OF_SERVICE.filter((t: any) => t.enabled) : [] })),
  route('POST', '/connector/api/types-of-service', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Name is required.');
    SERVICE_SEQ += 1;
    const t = { id: SERVICE_SEQ, name: body.name.trim(), price_group_id: Number(body.price_group_id || 0), packing_charge: Number(body.packing_charge || 0), packing_charge_type: body.packing_charge_type || 'fixed', enabled: true };
    TYPES_OF_SERVICE.push(t); return { data: t };
  }),
  route('DELETE', '/connector/api/types-of-service/:id', ({ params }: any) => { const i = TYPES_OF_SERVICE.findIndex((t: any) => t.id === Number(params.id)); if (i < 0) throw new ApiError(404); TYPES_OF_SERVICE.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Modules  /connector/api/module ────────────────────────────────
  route('GET', '/connector/api/module', () => ({ data: MODULES.slice() })),
  route('PUT', '/connector/api/module/:key', ({ params, body }: any) => {
    const m = MODULES.find((m: any) => m.key === params.key); if (!m) throw new ApiError(404, 'Module not found');
    if (m.core && body.enabled === false) throw new ApiError(422, 'Core modules cannot be disabled.');
    m.enabled = !!body.enabled; return { data: m };
  }),

  // ── Expenses  /connector/api/expense ──────────────────────────────
  route('GET', '/connector/api/expense-category', () => ({ data: EXPENSE_CATEGORIES })),
  route('POST', '/connector/api/expense-category', ({ body }: any) => { if (!String(body.name || '').trim()) throw new ApiError(422, 'Name required.'); const c = { id: ++EXPCAT_SEQ, name: body.name.trim() }; EXPENSE_CATEGORIES.push(c); return { data: c }; }),
  route('GET', '/connector/api/expense', () => ({ data: EXPENSES.slice().reverse().map(serializeExpense) })),
  route('POST', '/connector/api/expense', ({ body }: any) => {
    if (!(Number(body.amount) > 0)) throw new ApiError(422, 'Enter an amount.');
    EXP_SEQ += 1;
    const e = { id: EXP_SEQ, ref: 'EXP-' + String(EXP_SEQ).padStart(4, '0'), date: body.date || new Date().toISOString().slice(0, 10), category_id: Number(body.category_id) || null, location_id: Number(body.location_id) || 1, account_id: Number(body.account_id) || null, amount: Number(body.amount), payment_status: body.payment_status || 'paid', expense_for: body.expense_for || '', note: body.note || '', is_refund: !!body.is_refund };
    const acc = PAYMENT_ACCOUNTS.find((a: any) => a.id === e.account_id);
    if (acc && e.payment_status === 'paid') acc.balance += (e.is_refund ? e.amount : -e.amount);
    EXPENSES.push(e); return { data: serializeExpense(e) };
  }),
  route('DELETE', '/connector/api/expense/:id', ({ params }: any) => { const i = EXPENSES.findIndex((e: any) => e.id === Number(params.id)); if (i < 0) throw new ApiError(404); EXPENSES.splice(i, 1); return { data: { deleted: true } }; }),

  // ── Payment accounts  /connector/api/payment-account ──────────────
  route('GET', '/connector/api/account-type', () => ({ data: ACCOUNT_TYPES })),
  route('GET', '/connector/api/payment-account', () => ({ data: PAYMENT_ACCOUNTS.slice() })),
  route('POST', '/connector/api/payment-account', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Account name is required.');
    const a = { id: ++ACC_SEQ, name: body.name.trim(), type: body.type || 'Cash', account_number: body.account_number || '', balance: Number(body.balance || 0) };
    PAYMENT_ACCOUNTS.push(a); return { data: a };
  }),
  route('DELETE', '/connector/api/payment-account/:id', ({ params }: any) => { const i = PAYMENT_ACCOUNTS.findIndex((a: any) => a.id === Number(params.id)); if (i < 0) throw new ApiError(404); PAYMENT_ACCOUNTS.splice(i, 1); return { data: { deleted: true } }; }),
  route('POST', '/connector/api/payment-account/transfer', ({ body }: any) => {
    const from = PAYMENT_ACCOUNTS.find((a: any) => a.id === Number(body.from_id)), to = PAYMENT_ACCOUNTS.find((a: any) => a.id === Number(body.to_id));
    if (!from || !to) throw new ApiError(404, 'Account not found'); if (from.id === to.id) throw new ApiError(422, 'Choose two different accounts.');
    const amt = Number(body.amount || 0); if (amt <= 0) throw new ApiError(422, 'Enter an amount.');
    if (from.balance < amt) throw new ApiError(422, 'Insufficient balance in the source account.');
    from.balance -= amt; to.balance += amt; return { data: { from, to } };
  }),
  route('POST', '/connector/api/payment-account/:id/deposit', ({ params, body }: any) => {
    const a = PAYMENT_ACCOUNTS.find((a: any) => a.id === Number(params.id)); if (!a) throw new ApiError(404);
    a.balance += Number(body.amount || 0); return { data: a };
  }),

  // ── Restaurant suite (gated on the Restaurant add-on) ─────────────
  route('GET', '/connector/api/restaurant/table', () => ({ data: moduleOn('restaurant') ? TABLES.map((t: any) => ({ ...t, location_name: (LOCATION_LIST.find((l: any) => l.id === t.location_id) || {}).name || '' })) : [] })),
  route('POST', '/connector/api/restaurant/table', ({ body }: any) => { if (!String(body.name || '').trim()) throw new ApiError(422, 'Table name required.'); const t = { id: ++TBL_SEQ, name: body.name.trim(), location_id: Number(body.location_id) || 1, seats: Number(body.seats || 4), status: 'free' }; TABLES.push(t); return { data: t }; }),
  route('PUT', '/connector/api/restaurant/table/:id', ({ params, body }: any) => { const t = TABLES.find((t: any) => t.id === Number(params.id)); if (!t) throw new ApiError(404); if (body.status) t.status = body.status; return { data: t }; }),
  route('DELETE', '/connector/api/restaurant/table/:id', ({ params }: any) => { const i = TABLES.findIndex((t: any) => t.id === Number(params.id)); if (i < 0) throw new ApiError(404); TABLES.splice(i, 1); return { data: { deleted: true } }; }),

  route('GET', '/connector/api/restaurant/staff', () => ({ data: moduleOn('restaurant') ? SERVICE_STAFF.map((s: any) => ({ ...s, location_name: (LOCATION_LIST.find((l: any) => l.id === s.location_id) || {}).name || '' })) : [] })),
  route('POST', '/connector/api/restaurant/staff', ({ body }: any) => { if (!String(body.name || '').trim()) throw new ApiError(422, 'Name required.'); const s = { id: ++STAFF_SEQ, name: body.name.trim(), pin: String(body.pin || Math.floor(1000 + Math.random() * 9000)), location_id: Number(body.location_id) || 1 }; SERVICE_STAFF.push(s); return { data: s }; }),
  route('DELETE', '/connector/api/restaurant/staff/:id', ({ params }: any) => { const i = SERVICE_STAFF.findIndex((s: any) => s.id === Number(params.id)); if (i < 0) throw new ApiError(404); SERVICE_STAFF.splice(i, 1); return { data: { deleted: true } }; }),

  route('GET', '/connector/api/restaurant/modifier', () => ({ data: moduleOn('restaurant') ? MODIFIER_SETS : [] })),
  route('POST', '/connector/api/restaurant/modifier', ({ body }: any) => { if (!String(body.name || '').trim()) throw new ApiError(422, 'Name required.'); const m = { id: ++MOD_SEQ, name: body.name.trim(), options: (body.options || []).filter((o: any) => o.name).map((o: any) => ({ name: o.name, price: Number(o.price || 0) })) }; MODIFIER_SETS.push(m); return { data: m }; }),
  route('DELETE', '/connector/api/restaurant/modifier/:id', ({ params }: any) => { const i = MODIFIER_SETS.findIndex((m: any) => m.id === Number(params.id)); if (i < 0) throw new ApiError(404); MODIFIER_SETS.splice(i, 1); return { data: { deleted: true } }; }),

  route('GET', '/connector/api/restaurant/kitchen', () => ({ data: moduleOn('restaurant') ? KITCHEN_ORDERS.slice() : [] })),
  route('PUT', '/connector/api/restaurant/kitchen/:id', ({ params, body }: any) => { const o = KITCHEN_ORDERS.find((o: any) => o.id === Number(params.id)); if (!o) throw new ApiError(404); o.status = body.status; return { data: o }; }),

  // ── Superadmin / SaaS  /connector/api/superadmin ──────────────────
  route('GET', '/connector/api/superadmin/stats', () => {
    const active = BUSINESSES.filter((b: any) => b.status === 'active');
    const mrr = active.reduce((s: any, b: any) => s + ((PACKAGES.find((p: any) => p.id === b.package_id) || {}).price || 0), 0);
    return { data: { businesses: BUSINESSES.length, active: active.length, trial: BUSINESSES.filter((b: any) => b.status === 'trial').length, expired: BUSINESSES.filter((b: any) => b.status === 'expired').length, mrr, packages: PACKAGES.length } };
  }),
  route('GET', '/connector/api/superadmin/business', () => ({ data: BUSINESSES.map(serializeBiz) })),
  route('PUT', '/connector/api/superadmin/business/:id', ({ params, body }: any) => { const b = BUSINESSES.find((b: any) => b.id === Number(params.id)); if (!b) throw new ApiError(404); if (body.status) b.status = body.status; if (body.package_id) b.package_id = Number(body.package_id); return { data: serializeBiz(b) }; }),
  route('GET', '/connector/api/superadmin/package', () => ({ data: PACKAGES.slice() })),
  route('POST', '/connector/api/superadmin/package', ({ body }: any) => { if (!String(body.name || '').trim()) throw new ApiError(422, 'Package name required.'); const p = { id: ++PKG_SEQ, name: body.name.trim(), price: Number(body.price || 0), interval: body.interval || 'monthly', locations: Number(body.locations || 1), users: Number(body.users || 1), products: Number(body.products || 100), featured: !!body.featured, active: true }; PACKAGES.push(p); return { data: p }; }),
  route('DELETE', '/connector/api/superadmin/package/:id', ({ params }: any) => { const i = PACKAGES.findIndex((p: any) => p.id === Number(params.id)); if (i < 0) throw new ApiError(404); PACKAGES.splice(i, 1); return { data: { deleted: true } }; }),
  route('GET', '/connector/api/superadmin/payment', () => ({ data: SA_PAYMENTS.slice() })),
  route('PUT', '/connector/api/superadmin/payment/:id', ({ params, body }: any) => { const p = SA_PAYMENTS.find((p: any) => p.id === Number(params.id)); if (!p) throw new ApiError(404); p.status = body.status; return { data: p }; }),
  route('GET', '/connector/api/superadmin/gateway', () => ({ data: SA_GATEWAYS })),
  route('PUT', '/connector/api/superadmin/gateway', ({ body }: any) => { Object.assign(SA_GATEWAYS, body); return { data: SA_GATEWAYS }; }),

  // ── HRM / Essentials  /connector/api/hrm  (gated on hrm module) ────
  route('GET', '/connector/api/hrm/summary', () => {
    if (!moduleOn('hrm')) return { data: null };
    return { data: { employees: EMPLOYEES.length, present: ATTENDANCE.filter((a: any) => a.status === 'present').length, on_leave: EMPLOYEES.filter((e: any) => e.status === 'on_leave').length, pending_leave: LEAVES.filter((l: any) => l.status === 'pending').length, payroll: +PAYROLL.reduce((s: any, p: any) => s + p.net, 0).toFixed(2), open_todos: HR_TODOS.filter((t: any) => t.status === 'pending').length } };
  }),
  route('GET', '/connector/api/hrm/employee', () => ({ data: moduleOn('hrm') ? EMPLOYEES.map(serializeEmp) : [] })),
  route('GET', '/connector/api/hrm/employee/:id', ({ params }: any) => { const e = EMPLOYEES.find((e: any) => e.id === Number(params.id)); if (!e) throw new ApiError(404); return { data: employeeProfile(e) }; }),
  route('GET', '/connector/api/hrm/meta', () => ({ data: { departments: DEPARTMENTS, designations: DESIGNATIONS } })),
  route('GET', '/connector/api/hrm/org', () => ({ data: {
    departments: DEPARTMENTS.map((d: any) => ({ name: d, count: EMPLOYEES.filter((e: any) => e.department === d).length })),
    designations: DESIGNATIONS.map((d: any) => ({ name: d, count: EMPLOYEES.filter((e: any) => e.designation === d).length })),
  } })),
  route('POST', '/connector/api/hrm/org', ({ body }: any) => {
    const list = body.kind === 'designation' ? DESIGNATIONS : DEPARTMENTS;
    const name = String(body.name || '').trim(); if (!name) throw new ApiError(422, 'Name required.');
    if (list.some((x: any) => x.toLowerCase() === name.toLowerCase())) throw new ApiError(422, 'Already exists.');
    list.push(name); return { data: { ok: true } };
  }),
  route('DELETE', '/connector/api/hrm/org', ({ query }: any) => {
    const list = query.kind === 'designation' ? DESIGNATIONS : DEPARTMENTS;
    const i = list.findIndex((x: any) => x === query.name); if (i < 0) throw new ApiError(404);
    if (EMPLOYEES.some((e: any) => (query.kind === 'designation' ? e.designation : e.department) === query.name)) throw new ApiError(422, 'In use by employees — reassign them first.');
    list.splice(i, 1); return { data: { deleted: true } };
  }),
  route('POST', '/connector/api/hrm/employee', ({ body }: any) => {
    if (!String(body.name || '').trim()) throw new ApiError(422, 'Employee name is required.');
    EMP_SEQ += 1;
    const e = { id: EMP_SEQ, name: body.name.trim(), email: body.email || '', department: body.department || DEPARTMENTS[0], designation: body.designation || DESIGNATIONS[0], location_id: Number(body.location_id) || 1, salary: Number(body.salary || 0), joined: body.joined || new Date().toISOString().slice(0, 10), status: 'active' };
    EMPLOYEES.push(e); return { data: serializeEmp(e) };
  }),
  route('DELETE', '/connector/api/hrm/employee/:id', ({ params }: any) => { const i = EMPLOYEES.findIndex((e: any) => e.id === Number(params.id)); if (i < 0) throw new ApiError(404); EMPLOYEES.splice(i, 1); return { data: { deleted: true } }; }),

  route('GET', '/connector/api/hrm/attendance', () => ({ data: moduleOn('hrm') ? ATTENDANCE.map(decorateAtt) : [] })),
  route('POST', '/connector/api/hrm/attendance/clock', ({ body }: any) => {
    const today = new Date().toISOString().slice(0, 10), now = nowHM();
    let rec = ATTENDANCE.find((a: any) => a.employee_id === Number(body.employee_id) && a.date === today);
    if (!rec) { rec = { id: ATTENDANCE.length + 1, employee_id: Number(body.employee_id), date: today, clock_in: now, clock_out: '', status: clockStatus(Number(body.employee_id), now) }; ATTENDANCE.push(rec); }
    else rec.clock_out = now;
    return { data: decorateAtt(rec) };
  }),
  route('POST', '/connector/api/hrm/attendance/break', ({ body }: any) => {
    const today = new Date().toISOString().slice(0, 10), now = nowHM();
    const rec = ATTENDANCE.find((a: any) => a.employee_id === Number(body.employee_id) && a.date === today);
    if (!rec || !rec.clock_in || rec.clock_out) throw new ApiError(422, 'Employee must be clocked in to take a break.');
    rec.breaks = rec.breaks || [];
    const open = rec.breaks.find((b: any) => !b.end);
    if (open) open.end = now; else rec.breaks.push({ start: now, end: '' });
    return { data: decorateAtt(rec) };
  }),
  route('POST', '/connector/api/hrm/attendance/auto-absent', () => {
    const today = new Date().toISOString().slice(0, 10); let added = 0;
    EMPLOYEES.filter((e: any) => e.status === 'active' && (EMP_SHIFT[e.id] || {}).type !== 'flexible').forEach((e: any) => {
      if (!ATTENDANCE.find((a: any) => a.employee_id === e.id && a.date === today)) { ATTENDANCE.push({ id: ATTENDANCE.length + 1, employee_id: e.id, date: today, clock_in: '', clock_out: '', status: 'absent' }); added++; }
    });
    return { data: { added } };
  }),

  route('GET', '/connector/api/hrm/settings', () => ({ data: { ...HRM_SETTINGS, emp_shift: EMP_SHIFT } })),
  route('PUT', '/connector/api/hrm/settings', ({ body }: any) => { Object.assign(HRM_SETTINGS, body); return { data: { ...HRM_SETTINGS, emp_shift: EMP_SHIFT } }; }),
  route('PUT', '/connector/api/hrm/employee/:id/shift', ({ params, body }: any) => {
    const id = Number(params.id); EMP_SHIFT[id] = { type: body.type || 'fixed', start: body.start || '', end: body.end || '' };
    return { data: { employee_id: id, ...EMP_SHIFT[id] } };
  }),

  route('GET', '/connector/api/hrm/leave', () => ({ data: moduleOn('hrm') ? LEAVES.map((l: any) => ({ ...l, employee_name: empName(l.employee_id) })) : [] })),
  route('GET', '/connector/api/hrm/leave-type', () => ({ data: LEAVE_TYPES.slice() })),
  route('POST', '/connector/api/hrm/leave-type', ({ body }: any) => { if (!String(body.name || '').trim()) throw new ApiError(422, 'Name required.'); if (LEAVE_TYPES.some((t: any) => t.name.toLowerCase() === body.name.trim().toLowerCase())) throw new ApiError(422, 'That leave type already exists.'); LEAVE_TYPE_SEQ += 1; const t = { id: LEAVE_TYPE_SEQ, name: body.name.trim(), default_days: Number(body.default_days || 0), accrues: !!body.accrues, paid: body.paid !== false }; LEAVE_TYPES.push(t); return { data: t }; }),
  route('PUT', '/connector/api/hrm/leave-type/:id', ({ params, body }: any) => { const t = LEAVE_TYPES.find((x: any) => x.id === Number(params.id)); if (!t) throw new ApiError(404); Object.assign(t, { default_days: body.default_days != null ? Number(body.default_days) : t.default_days, accrues: body.accrues != null ? body.accrues : t.accrues, paid: body.paid != null ? body.paid : t.paid }); return { data: t }; }),
  route('DELETE', '/connector/api/hrm/leave-type/:id', ({ params }: any) => { const i = LEAVE_TYPES.findIndex((x: any) => x.id === Number(params.id)); if (i < 0) throw new ApiError(404); LEAVE_TYPES.splice(i, 1); return { data: { deleted: true } }; }),
  route('PUT', '/connector/api/hrm/leave-override/:empId', ({ params, body }: any) => { EMP_LEAVE_OVERRIDE[Number(params.empId)] = body.overrides || {}; return { data: { employee_id: Number(params.empId), overrides: EMP_LEAVE_OVERRIDE[Number(params.empId)] } }; }),
  route('GET', '/connector/api/hrm/leave-override/:empId', ({ params }: any) => ({ data: EMP_LEAVE_OVERRIDE[Number(params.empId)] || {} })),
  route('GET', '/connector/api/hrm/leave-balance', () => ({ data: moduleOn('hrm') ? EMPLOYEES.map((e: any) => ({ employee_id: e.id, employee_name: e.name, balances: leaveBalance(e.id) })) : [] })),
  route('GET', '/connector/api/hrm/leave-balance/:empId', ({ params }: any) => ({ data: leaveBalance(Number(params.empId)) })),
  route('POST', '/connector/api/hrm/leave', ({ body }: any) => {
    const type = body.type || 'Casual', days = Number(body.days || 1), empId = Number(body.employee_id);
    const lt = LEAVE_TYPES.find((t: any) => t.name === type);
    if (lt && lt.paid) { const bal = leaveBalance(empId).find((b: any) => b.type === type); if (bal && (bal.taken + bal.pending + days) > bal.entitled) throw new ApiError(422, `Exceeds ${type} balance — only ${(bal.balance - bal.pending).toFixed(1)} day(s) left.`); }
    LEAVE_SEQ += 1;
    const l = { id: LEAVE_SEQ, employee_id: empId, type, from: body.from || '', to: body.to || '', days, reason: body.reason || '', status: 'pending', approved_by: null };
    LEAVES.push(l); return { data: { ...l, employee_name: empName(l.employee_id) } };
  }),
  route('PUT', '/connector/api/hrm/leave/:id', ({ params, body }: any) => { const l = LEAVES.find((l: any) => l.id === Number(params.id)); if (!l) throw new ApiError(404); l.status = body.status; l.approved_by = body.status === 'pending' ? null : (body.approved_by || 'Amina Yusuf'); const e = EMPLOYEES.find((e: any) => e.id === l.employee_id); if (e) e.status = body.status === 'approved' ? 'on_leave' : 'active'; return { data: { ...l, employee_name: empName(l.employee_id) } }; }),

  route('GET', '/connector/api/hrm/payroll', () => ({ data: moduleOn('hrm') ? PAYROLL.map((p: any) => ({ ...p, employee_name: empName(p.employee_id) })) : [] })),
  route('GET', '/connector/api/hrm/payslip/:id', ({ params }: any) => { const ps = buildPayslip(Number(params.id)); if (!ps) throw new ApiError(404, 'Payroll record not found'); return { data: ps }; }),
  route('GET', '/connector/api/hrm/payslip-settings', () => ({ data: PAYSLIP_SETTINGS })),
  route('PUT', '/connector/api/hrm/payslip-settings', ({ body }: any) => { Object.assign(PAYSLIP_SETTINGS, body); return { data: PAYSLIP_SETTINGS }; }),
  route('GET', '/connector/api/hrm/attendance-summary', ({ query }: any) => {
    if (!moduleOn('hrm')) return { data: [] };
    const month = query.month || new Date().toISOString().slice(0, 7);
    return { data: EMPLOYEES.map((e: any) => ({ employee_id: e.id, employee_name: e.name, ...attendanceSummary(e.id, month) })) };
  }),
  route('GET', '/connector/api/hrm/attendance-summary/:empId', ({ params, query }: any) => ({ data: attendanceSummary(Number(params.empId), query.month) })),
  route('POST', '/connector/api/hrm/payroll', ({ body }: any) => {
    PAY_SEQ += 1;
    const basic = Number(body.basic || 0), allowance = Number(body.allowance || 0), deduction = Number(body.deduction || 0), overtime = Number(body.overtime || 0), bonus = Number(body.bonus || 0), incentive = Number(body.incentive || 0);
    const p = { id: PAY_SEQ + 100, employee_id: Number(body.employee_id), month: body.month || new Date().toISOString().slice(0, 7), basic, allowance, overtime, bonus, incentive, deduction, net: +(basic + allowance + overtime + bonus + incentive - deduction).toFixed(2), status: 'paid' };
    let recover = deduction;
    ADVANCES.filter((a: any) => a.employee_id === p.employee_id && a.status === 'outstanding').forEach((a: any) => {
      if (recover <= 0) return;
      const take = Math.min(a.outstanding, recover);
      a.outstanding = +(a.outstanding - take).toFixed(2); recover -= take;
      if (a.outstanding <= 0.001) a.status = 'settled';
    });
    PAYROLL.push(p); return { data: { ...p, employee_name: empName(p.employee_id) } };
  }),

  route('GET', '/connector/api/hrm/advance', () => ({ data: moduleOn('hrm') ? ADVANCES.slice().reverse().map(serializeAdvance) : [] })),
  route('GET', '/connector/api/hrm/advance/outstanding/:empId', ({ params }: any) => ({ data: { outstanding: outstandingAdvance(Number(params.empId)) } })),
  route('POST', '/connector/api/hrm/advance', ({ body }: any) => {
    const amount = Number(body.amount || 0); if (amount <= 0) throw new ApiError(422, 'Enter an amount.');
    if (!body.employee_id) throw new ApiError(422, 'Select an employee.');
    ADVANCE_SEQ += 1;
    const a = { id: ADVANCE_SEQ, employee_id: Number(body.employee_id), amount, date: body.date || new Date().toISOString().slice(0, 10), account_id: Number(body.account_id) || null, note: body.note || '', outstanding: amount, status: 'outstanding' };
    const acc = PAYMENT_ACCOUNTS.find((x: any) => x.id === a.account_id); if (acc) acc.balance -= amount;
    ADVANCES.push(a); return { data: serializeAdvance(a) };
  }),
  route('DELETE', '/connector/api/hrm/advance/:id', ({ params }: any) => { const i = ADVANCES.findIndex((a: any) => a.id === Number(params.id)); if (i < 0) throw new ApiError(404); ADVANCES.splice(i, 1); return { data: { deleted: true } }; }),

  route('GET', '/connector/api/hrm/todo', () => ({ data: moduleOn('hrm') ? HR_TODOS.map((t: any) => ({ ...t, assigned_name: empName(t.assigned_to) })) : [] })),
  route('POST', '/connector/api/hrm/todo', ({ body }: any) => { TODO_SEQ += 1; const t = { id: TODO_SEQ, title: body.title || '', assigned_to: Number(body.assigned_to) || 1, priority: body.priority || 'medium', status: 'pending', due: body.due || '' }; HR_TODOS.push(t); return { data: { ...t, assigned_name: empName(t.assigned_to) } }; }),
  route('PUT', '/connector/api/hrm/todo/:id', ({ params, body }: any) => { const t = HR_TODOS.find((t: any) => t.id === Number(params.id)); if (!t) throw new ApiError(404); t.status = body.status; return { data: { ...t, assigned_name: empName(t.assigned_to) } }; }),

  route('GET', '/connector/api/hrm/shift', () => ({ data: moduleOn('hrm') ? SHIFTS.map(serializeShift) : [] })),
  route('POST', '/connector/api/hrm/shift', ({ body }: any) => {
    if (!body.employee_id) throw new ApiError(422, 'Select an employee.');
    SHIFT_SEQ += 1;
    const s = { id: SHIFT_SEQ, employee_id: Number(body.employee_id), location_id: Number(body.location_id) || 1, date: body.date || new Date().toISOString().slice(0, 10), start: body.start || '09:00', end: body.end || '17:00', role: body.role || '' };
    SHIFTS.push(s); return { data: serializeShift(s) };
  }),
  route('DELETE', '/connector/api/hrm/shift/:id', ({ params }: any) => { const i = SHIFTS.findIndex((s: any) => s.id === Number(params.id)); if (i < 0) throw new ApiError(404); SHIFTS.splice(i, 1); return { data: { deleted: true } }; }),

  route('GET', '/connector/api/hrm/shift-swap', () => ({ data: moduleOn('hrm') ? SHIFT_SWAPS.slice().reverse().map(serializeSwap) : [] })),
  route('POST', '/connector/api/hrm/shift-swap', ({ body }: any) => {
    if (!body.shift_id || !body.to_id) throw new ApiError(422, 'Pick a shift and a colleague.');
    const shift = SHIFTS.find((s: any) => s.id === Number(body.shift_id)); if (!shift) throw new ApiError(404, 'Shift not found');
    SWAP_SEQ += 1;
    const s = { id: SWAP_SEQ, shift_id: Number(body.shift_id), from_id: shift.employee_id, to_id: Number(body.to_id), reason: body.reason || '', status: 'pending', date: new Date().toISOString().slice(0, 10) };
    SHIFT_SWAPS.push(s); return { data: serializeSwap(s) };
  }),
  route('PUT', '/connector/api/hrm/shift-swap/:id', ({ params, body }: any) => {
    const s = SHIFT_SWAPS.find((x: any) => x.id === Number(params.id)); if (!s) throw new ApiError(404);
    s.status = body.status;
    if (body.status === 'approved') { const shift = SHIFTS.find((x: any) => x.id === s.shift_id); if (shift) shift.employee_id = s.to_id; }
    return { data: serializeSwap(s) };
  }),
  route('DELETE', '/connector/api/hrm/shift-swap/:id', ({ params }: any) => { const i = SHIFT_SWAPS.findIndex((s: any) => s.id === Number(params.id)); if (i < 0) throw new ApiError(404); SHIFT_SWAPS.splice(i, 1); return { data: { deleted: true } }; }),

  // GET /connector/api/sell  (list sales)
  route('GET', '/connector/api/sell', ({ query }: any) =>
    paginate(LEDGER.sells.slice().reverse().map(upsSell), '/connector/api/sell', Number(query.per_page) || 50, Number(query.page) || 1)),

  // POST /connector/api/sell  (create sale)
  route('POST', '/connector/api/sell', ({ body }: any) => {
    const created = (body.sells || []).map((s: any) => {
      (s.products || []).forEach((ln: any) => {
        const p = PRODUCTS.find((p: any) => numId(p.id) === Number(ln.product_id));
        if (!p) throw new ApiError(422, 'Unknown product_id ' + ln.product_id);
        const avail = availStock(p, ln.variation);
        if (avail < Number(ln.quantity)) throw new ApiError(422, `Insufficient stock for ${p.name}${ln.variation ? ' · ' + ln.variation : ''} (have ${avail === Infinity ? '∞' : avail})`);
      });
      LEDGER.invoiceSeq += 1;
      const invoice_no = 'AS' + String(LEDGER.invoiceSeq).padStart(4, '0');
      const id = 1000 + LEDGER.invoiceSeq;
      const lines = (s.products || []).map((ln: any) => ({ product_id: Number(ln.product_id), variation: ln.variation || null, qty: Number(ln.quantity), unit_price: Number(ln.unit_price), returned: 0 }));
      const subtotal = lines.reduce((a: any, l: any) => a + l.unit_price * l.qty, 0);
      const discount_amount = Number(s.discount_amount || 0);
      const tax = Number(s.tax_amount || 0);
      const rec: any = {
        id, invoice_no, location_id: Number(s.location_id) || 1, contact_id: Number(s.contact_id) || 1,
        customer: s.customer_name || 'Walk-in', method: s.method || 'cash',
        date: s.transaction_date || new Date().toISOString().slice(0, 19).replace('T', ' '),
        t: Date.now(), subtotal, tax, discount_type: s.discount_type || 'fixed', discount_amount,
        final_total: subtotal + tax - discount_amount, status: 'final',
        lines, payments: s.payments || [{ amount: subtotal + tax - discount_amount, method: s.method || 'cash' }],
      };
      const tendered = (rec.payments || []).reduce((a: any, p: any) => a + Number(p.amount || 0), 0);
      rec.amount_paid = +Math.min(tendered, rec.final_total).toFixed(2);
      rec.change_return = +Math.max(0, tendered - rec.final_total).toFixed(2);
      rec.payment_status = tendered >= rec.final_total - 0.01 ? 'paid' : tendered > 0 ? 'partial' : 'due';
      lines.forEach((ln: any) => { const p = PRODUCTS.find((p: any) => numId(p.id) === ln.product_id); if (p) deductStock(p, ln.variation, ln.qty); });
      (rec.payments || []).forEach((p: any) => logToRegister(p.method, Number(p.amount || 0)));
      if (rec.change_return) logToRegister('cash', -rec.change_return);
      const cust = CONTACTS.find((c: any) => c.id === Number(s.contact_id));
      if (cust && cust.name !== 'Walk-in Customer') {
        cust.total_sale = (cust.total_sale || 0) + rec.final_total;
        cust.total_paid = (cust.total_paid || 0) + rec.amount_paid;
        if (s.redeem_points) cust.points_redeemed = (cust.points_redeemed || 0) + Number(s.redeem_points);
      }
      SALES.unshift({
        id: invoice_no, customer: rec.customer, cashier: 'Amina Y.', method: rec.method,
        methodLabel: (PAYMENT_METHODS.find((m: any) => m.id === rec.method) || {}).label || 'Cash',
        items: lines.reduce((a: any, l: any) => a + l.qty, 0), total: rec.final_total, minsAgo: 0, status: 'completed',
        _txn: true, _id: id,
      });
      LEDGER.sells.push(rec);
      return upsSell(rec);
    });
    persistLedger();
    return { data: created };
  }),

  // GET /connector/api/sell/:id
  route('GET', '/connector/api/sell/:id', ({ params }: any) => {
    const s = LEDGER.sells.find((s: any) => s.id === Number(params.id));
    if (!s) throw new ApiError(404, 'Sell not found');
    return { data: [upsSell(s)] };
  }),

  // POST /connector/api/sell-return
  route('POST', '/connector/api/sell-return', ({ body }: any) => {
    const s = LEDGER.sells.find((s: any) => s.id === Number(body.transaction_id) || s.invoice_no === body.invoice_no);
    if (!s) throw new ApiError(404, 'Original sell not found');
    let returnTotal = 0;
    (body.products || []).forEach((r: any) => {
      const idx = Number(r.line_index ?? r.sell_line_id);
      const ln = s.lines[idx] != null ? s.lines[idx] : s.lines.find((l: any, i: any) => (s.id * 100 + i) === Number(r.sell_line_id));
      const qty = Number(r.quantity);
      if (!ln || qty <= 0) return;
      ln.returned = (ln.returned || 0) + qty;
      const p = PRODUCTS.find((p: any) => numId(p.id) === ln.product_id);
      if (p) p.stock += qty;
      returnTotal += qty * ln.unit_price;
    });
    s.status = 'refunded';
    if (CURRENT_REGISTER) CURRENT_REGISTER.refunds += returnTotal;
    const sale = SALES.find((x: any) => x.id === s.invoice_no); if (sale) sale.status = 'refunded';
    persistLedger();
    return { data: { transaction_id: s.id, invoice_no: s.invoice_no, return_total: f4(returnTotal), status: 'refunded' } };
  }),

  // GET /connector/api/list-sell-return
  route('GET', '/connector/api/list-sell-return', ({ query }: any) => {
    const rows = LEDGER.sells.filter((s: any) => s.status === 'refunded')
      .filter((s: any) => !query.sell_id || s.id === Number(query.sell_id))
      .map((s: any) => ({ id: s.id, invoice_no: s.invoice_no, transaction_date: s.date, final_total: f4(s.final_total), payment_status: 'paid' }));
    return paginate(rows, '/connector/api/list-sell-return', 50, 1);
  }),
];

// ═══════════════════════════════════════════════════════════════════
//  ADAPTERS  —  UltimatePOS shape  →  clean view-model for the UI.
// ═══════════════════════════════════════════════════════════════════
function adaptProduct(u: any) {
  if (u && u._view) return u._view;                  // mock: loss-free local record
  const v = (((u.product_variations || [])[0] || {}).variations || [])[0] || {};
  const loc = (v.variation_location_details || [])[0] || {};
  const catEntry = Object.entries(CAT_NUM).find(([, n]) => n === u.category_id);
  return {
    id: 'p' + u.id, name: u.name, sku: u.sku, cat: catEntry ? catEntry[0] : 'grocery',
    price: parseFloat(v.sell_price_inc_tax || v.default_sell_price || 0),
    cost: parseFloat(v.dpp_inc_tax || 0),
    stock: parseInt(loc.qty_available || 0, 10),
    unit: u.unit || 'pc', img: u.image_url || null, sw: '#D9C9A3',
    _ups: u,
  };
}

// ── Real backend adapters (/api/v1) → the flat view-model screens render ───────
function attrsToName(attrs: any): string {
  if (!attrs || typeof attrs !== 'object') return '';
  return Object.values(attrs).join(' / ');
}
// Categories cache (name → uuid) so the product editor can send category_id.
const REAL_CAT_BY_NAME: Record<string, string> = {};
function adaptRealProduct(p: any): any {
  if (!p) return p;
  const catName = (p.category && p.category.name) || '';
  return {
    id: p.id,                                   // real uuid
    name: p.name,
    sku: p.sku || '',
    cat: catName || (p.categoryId || ''),       // grouping key = category name (matches category.list ids)
    brand_id: p.brandId || '',
    price: Number(p.sellingPrice ?? p.selling_price ?? 0),
    cost: Number(p.costPrice ?? p.cost_price ?? 0),
    stock: p.total_stock ?? (Array.isArray(p.stockLevels) ? p.stockLevels.reduce((s: number, sl: any) => s + (sl.quantity || 0), 0) : 0),
    unit: p.unitOfMeasure || p.unit_of_measure || 'unit',
    sw: (p.category && p.category.color) || '#D9C9A3',
    img: p.imageUrl || p.image_url || null,
    alert_quantity: p.reorderPoint ?? p.minStockLevel ?? 0,
    barcode: p.barcode || '',
    not_for_selling: p.isActive === false,
    variations: Array.isArray(p.variants) ? p.variants.map((v: any) => ({ id: v.id, name: attrsToName(v.attributes), price: Number(v.sellingPrice ?? 0), cost: Number(v.costPrice ?? 0), stock: 0, sub_sku: v.sku || '' })) : [],
    _real: p,
  };
}
// Editor view-model → backend ProductSchema (snake_case) body.
function toRealProductBody(vm: any): any {
  return {
    name: vm.name,
    sku: vm.sku || undefined,
    barcode: vm.barcode || undefined,
    category_id: (vm.cat && REAL_CAT_BY_NAME[vm.cat]) || vm.category_id || undefined,
    brand_id: isUuid(vm.brand_id) ? vm.brand_id : undefined,
    unit_of_measure: vm.unit || 'unit',
    cost_price: Number(vm.cost || 0),
    selling_price: Number(vm.price || 0),
    reorder_point: Number(vm.alert_quantity || 0),
    is_active: vm.not_for_selling ? false : true,
    opening_stock: vm.stock != null ? Number(vm.stock) : undefined,
  };
}
// Map the mock POS payment method → backend enum.
function realPayMethod(m: any): string {
  return ({ cash: 'cash', zaad: 'zaad', evc: 'zaad', card: 'visa', visa: 'visa', mastercard: 'mastercard', credit: 'credit' } as any)[m] || 'cash';
}
const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{32,36}$/i.test(v);
// Client-local HH:MM + YYYY-MM-DD (sent to HRM attendance so server-UTC doesn't skew times).
function hrStamp(): { at: string; date: string } {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return { at: `${p(d.getHours())}:${p(d.getMinutes())}`, date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` };
}

// Map a backend Shift row → the cash-register shape the POS UI expects.
// Backend shift: { id, locationId, location:{name}, openingFloat, totalCash,
//   totalZaad, totalCard, totalSales, totalTransactions, expectedCash, openedAt }
function realRegister(s: any): any {
  if (!s) return null;
  const opening = Number(s.openingFloat || 0);
  const cash = Number(s.totalCash || 0);
  return {
    id: s.id,
    location_id: s.locationId || null,
    location_name: (s.location && s.location.name) || '—',
    opening_cash: opening,
    total_sales: Number(s.totalSales || 0),
    tx_count: Number(s.totalTransactions || 0),
    refunds: 0, // backend does not track a per-shift refund total yet
    totals: { cash, zaad: Number(s.totalZaad || 0), evc: 0, card: Number(s.totalCard || 0), bank: 0, advance: 0 },
    // expectedCash is only persisted at close; for an open till compute it live.
    expected_cash: s.expectedCash != null ? Number(s.expectedCash) : opening + cash,
    opened_at: s.openedAt ? String(s.openedAt).slice(0, 19).replace('T', ' ') : '',
    status: s.status,
  };
}

// ── Tax rates (/api/v1/tax/rates) → UI {id, name, amount} ──────────────────────
// Backend stores rate as a 0–1 fraction (0.16); screens show whole percent (16).
function adaptRealTaxRate(t: any): any {
  return {
    id: t.id, name: t.name,
    amount: Number(t.rate || 0) * 100,
    is_default: !!t.isDefault, is_inclusive: !!t.isInclusive,
    product_count: (t._count && t._count.products) || 0,
    _real: t,
  };
}

// ── Modules: drive the Plan & Modules screen off the backend catalog (source of
//   truth for enabled/base/add-on), enriched with cosmetic icon/group/price. ────
const MOD_COSMETIC: Record<string, any> = {
  core:         { icon: '◆', group: 'Core' },
  pos:          { icon: '⊞', group: 'Core' },
  inventory:    { icon: '◫', group: 'Core' },
  operations:   { icon: '◳', group: 'Operations' },
  pharmacy:     { icon: '✚', group: 'Vertical', price: 15 },
  hotel:        { icon: '⌂', group: 'Vertical', price: 25 },
  restaurant:   { icon: '♨', group: 'Vertical', price: 19 },
  wholesale:    { icon: '⊟', group: 'Vertical', price: 14 },
  construction: { icon: '◭', group: 'Vertical', price: 22 },
  credit:       { icon: '₵', group: 'Add-on', price: 9 },
  insights:     { icon: '✦', group: 'Add-on', price: 12 },
  hrm:          { icon: '⚇', group: 'Operations', price: 18 },
  superadmin:   { icon: '⚿', group: 'Platform', price: 39 },
};
function adaptRealModules(catalog: any[]): any[] {
  return (catalog || []).map((m: any) => {
    const c = MOD_COSMETIC[m.key] || {};
    return {
      key: m.key, name: m.name, description: m.description || '',
      enabled: !!m.enabled,
      core: !!m.alwaysOn,            // always-on base (not toggleable)
      addon: m.addon === true,       // opt-in add-on / vertical
      requires: m.requires || [],
      icon: c.icon || '▣', group: c.group || 'Add-on', price: c.price || 0,
    };
  });
}

// ── Purchase orders (/api/v1/purchase-orders) → UI view-model ──────────────────
function adaptRealPO(o: any): any {
  if (!o) return o;
  const lines = Array.isArray(o.items) ? o.items.map((it: any) => ({
    product_id: it.productId, product_name: (it.product && it.product.name) || '',
    qty: Number(it.orderedQty || 0), unit_cost: Number(it.unitPrice || 0),
  })) : [];
  return {
    id: o.id, ref: o.poNumber,
    supplier_id: o.supplierId, party_name: (o.supplier && o.supplier.name) || '—',
    location_id: o.locationId, location_name: (o.location && o.location.name) || '—',
    date: o.createdAt ? String(o.createdAt).slice(0, 10) : '',
    status: o.status,
    item_count: (o._count && o._count.items) != null ? o._count.items : lines.length,
    total: Number(o.totalAmount || 0),
    lines,
    _real: o,
  };
}
function toRealPOBody(b: any): any {
  return {
    supplier_id: b.supplier_id,
    location_id: isUuid(b.location_id) ? b.location_id : undefined,
    expected_delivery: (typeof b.expected_delivery === 'string' && b.expected_delivery) || (typeof b.date === 'string' && b.date) || undefined,
    notes: b.notes || undefined,
    items: (b.lines || []).map((l: any) => ({
      product_id: l.product_id,
      ordered_qty: Number(l.qty || 1),
      unit_price: Number(l.unit_cost || 0),
    })),
  };
}

// ── Stock transfers (/api/v1/stock/transfers) → UI view-model ──────────────────
function adaptRealTransfer(t: any): any {
  if (!t) return t;
  const lines = Array.isArray(t.items) ? t.items.map((it: any) => ({
    product_id: it.productId, product_name: (it.product && it.product.name) || '',
    qty: Number(it.requestedQty != null ? it.requestedQty : (it.dispatchedQty || 0)),
    unit_cost: Number((it.product && it.product.costPrice) || 0),
  })) : [];
  return {
    id: t.id, ref: t.transferNumber,
    from_location_id: t.fromLocationId, from_name: (t.fromLocation && t.fromLocation.name) || '—',
    to_location_id: t.toLocationId, to_name: (t.toLocation && t.toLocation.name) || '—',
    date: t.createdAt ? String(t.createdAt).slice(0, 10) : '',
    status: t.status,
    item_count: lines.reduce((n: number, l: any) => n + l.qty, 0),
    total_value: lines.reduce((s: number, l: any) => s + l.qty * l.unit_cost, 0),
    lines,
    _real: t,
  };
}
function toRealTransferBody(b: any): any {
  return {
    from_location_id: b.from_location_id,
    to_location_id: b.to_location_id,
    notes: b.notes || undefined,
    items: (b.lines || []).map((l: any) => ({ product_id: l.product_id, qty: Number(l.qty || 1) })),
  };
}

// ── Contacts: customers (/api/v1/customers) + suppliers (/api/v1/suppliers) ─────
// The contacts screen is one kind-driven view; `type` routes to the right table.
function adaptRealCustomer(c: any): any {
  if (!c) return c;
  return {
    id: c.id, name: c.name, type: 'customer',
    contact_id: 'CUS-' + String(c.id || '').replace(/-/g, '').slice(0, 6).toUpperCase(),
    mobile: c.phone || '', email: c.email || '', address: c.address || '',
    loyalty_points: c.loyaltyPoints || 0,
    credit_limit: Number(c.creditLimit || 0),
    due: Number(c.outstandingBalance || 0),
    total_sale: 0, total_purchase: 0, opening_balance: 0, advance_balance: 0,
    customer_group_id: c.customerGroupId || '1',                       // '1' = Retail / no group
    group_name: (c.customerGroup && c.customerGroup.name) || 'Retail',
    _real: c,
  };
}
function toRealCustomerBody(f: any): any {
  return {
    name: f.name,
    phone: f.mobile || undefined,
    email: f.email || undefined,
    address: f.address || undefined,
    credit_limit: f.credit_limit ? Number(f.credit_limit) : 0,
    customer_group_id: isUuid(f.customer_group_id) ? f.customer_group_id : null,  // '1'/Retail → no group
  };
}
function adaptRealSupplier(s: any): any {
  if (!s) return s;
  return {
    id: s.id, name: s.name, type: 'supplier',
    contact_id: 'SUP-' + String(s.id || '').replace(/-/g, '').slice(0, 6).toUpperCase(),
    mobile: s.phone || s.whatsapp || '', email: s.email || '', address: s.address || '',
    tax_number: '',
    pay_term_number: s.paymentTerms || '', pay_term_type: 'days',
    credit_limit: Number(s.creditLimit || 0),
    due: Number(s.outstandingBalance || 0),
    total_sale: 0, total_purchase: 0, opening_balance: 0, advance_balance: 0,
    po_count: (s._count && s._count.purchaseOrders) || 0,
    _real: s,
  };
}
function toRealSupplierBody(f: any): any {
  return {
    name: f.name,
    phone: f.mobile || undefined,
    email: f.email || undefined,
    address: f.address || undefined,
    payment_terms: f.pay_term_number ? Number(f.pay_term_number) : 0,
    credit_limit: f.credit_limit ? Number(f.credit_limit) : 0,
  };
}

// ── Users & roles (/api/v1/users) ──────────────────────────────────────────────
// The backend has no roles table — just a fixed `role` enum on each user. We
// surface those four as synthetic numeric-id "roles" so the users screen's
// role picker keeps working, and translate role_id ↔ enum on read/write.
const REAL_ROLES: any[] = [
  { id: 1, key: 'owner',     name: 'Owner' },
  { id: 2, key: 'manager',   name: 'Manager' },
  { id: 3, key: 'cashier',   name: 'Cashier' },
  { id: 4, key: 'warehouse', name: 'Warehouse' },
];
const roleKeyById = (id: any) => (REAL_ROLES.find((r: any) => r.id === Number(id)) || {}).key || 'cashier';
const roleByKey = (key: any) => REAL_ROLES.find((r: any) => r.key === key) || REAL_ROLES[2];
function adaptRealUser(u: any): any {
  if (!u) return u;
  const r = roleByKey(u.role);
  return {
    id: u.id, name: u.name, email: u.email,
    username: u.email ? String(u.email).split('@')[0] : '',  // backend has no username
    allow_login: true,
    role_id: r.id, role_name: r.name,
    is_active: u.isActive !== false,
    locations: [], location_access: 'all',
    max_discount: null, commission_percent: Number(u.commissionPercent || 0),
    last_login: u.lastLogin ? String(u.lastLogin).slice(0, 10) : '',
    _real: u,
  };
}
const commissionVal = (v: any) => (v === '' || v == null) ? undefined : Number(v);
function toRealCreateUserBody(f: any): any {
  return {
    name: f.name,
    email: f.email,
    password: f.password,
    role: roleKeyById(f.role_id),
    commission_percent: commissionVal(f.commission_percent),
    ...(f.pin ? { pin: String(f.pin) } : {}),
  };
}
function toRealUpdateUserBody(f: any): any {
  return {
    name: f.name,
    role: roleKeyById(f.role_id),
    is_active: f.is_active !== false,
    commission_percent: commissionVal(f.commission_percent),
    // Only touch the PIN when the form provides one — blank leaves it unchanged.
    ...(f.pin ? { pin: String(f.pin) } : {}),
  };
}

// ── Locations (/api/v1/locations) ──────────────────────────────────────────────
// The backend stores only name/type(enum)/address/isActive; the screen's richer
// fields (manager, city, payment methods, invoice scheme…) have no columns yet.
const UI_TO_LOC_TYPE: Record<string, string> = { Retail: 'store', Kiosk: 'store', Warehouse: 'warehouse', Headquarters: 'branch', store: 'store', warehouse: 'warehouse', branch: 'branch' };
const LOC_TYPE_TO_UI: Record<string, string> = { warehouse: 'Warehouse', store: 'Retail', branch: 'Headquarters' };
function adaptRealLocation(l: any): any {
  if (!l) return l;
  return {
    id: l.id, name: l.name,
    type: LOC_TYPE_TO_UI[l.type] || l.type || 'Retail',
    status: l.isActive === false ? 'inactive' : 'active',
    landmark: l.address || '',
    _real: l,
  };
}
function toRealLocationBody(f: any): any {
  const body: any = {
    name: f.name,
    type: UI_TO_LOC_TYPE[f.type] || 'store',
    address: f.landmark || f.address || undefined,
  };
  if (f.is_active !== undefined) body.is_active = f.is_active;
  return body;
}

// ── Expenses (/api/v1/expenses, /api/v1/expense-categories) ───────────────────
function adaptRealExpense(e: any): any {
  if (!e) return e;
  return {
    id: e.id,
    ref: e.expenseNumber || ('EXP-' + String(e.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()),
    category_id: e.categoryId, category_name: (e.category && e.category.name) || '—',
    location_id: e.locationId, location_name: (e.location && e.location.name) || '—',
    account_name: '—',
    expense_for: e.expenseFor || '',
    amount: Number(e.amount || 0),
    payment_status: e.paymentStatus || 'paid',
    is_refund: !!e.isRefund,
    note: e.note || '',
    date: e.expenseDate ? String(e.expenseDate).slice(0, 10) : '',
    _real: e,
  };
}
function toRealExpenseBody(f: any): any {
  return {
    category_id: isUuid(f.category_id) ? f.category_id : undefined,
    location_id: isUuid(f.location_id) ? f.location_id : undefined,
    amount: Number(f.amount || 0),
    date: (typeof f.date === 'string' && f.date) || undefined,
    payment_status: f.payment_status === 'due' ? 'due' : 'paid',
    expense_for: f.expense_for || undefined,
    note: f.note || undefined,
    is_refund: !!f.is_refund,
  };
}

// ── Invoice layouts (/api/v1/invoice-layouts) ─────────────────────────────────
function adaptRealInvoiceLayout(l: any): any {
  if (!l) return l;
  return {
    id: l.id, name: l.name, design: l.design || 'classic',
    header_text: l.headerText || '', footer_text: l.footerText || '',
    show_address: l.showAddress !== false,
    show_tax_summary: l.showTaxSummary !== false,
    show_total_in_words: !!l.showTotalInWords,
    show_discount: l.showDiscount !== false,
    show_qr: !!l.showQr,
    show_letterhead: !!l.showLetterhead,
    hide_prices: !!l.hidePrices,
    is_default: !!l.isDefault,
    _real: l,
  };
}
const INVOICE_LAYOUT_KEYS = ['name', 'design', 'header_text', 'footer_text', 'show_address', 'show_tax_summary', 'show_total_in_words', 'show_discount', 'show_qr', 'show_letterhead', 'hide_prices', 'is_default'];
function toRealInvoiceLayoutBody(f: any): any {
  const b: any = {};
  for (const k of INVOICE_LAYOUT_KEYS) if (f[k] !== undefined) b[k] = f[k];
  return b;
}

// ── Discounts (/api/v1/discounts) ─────────────────────────────────────────────
function adaptRealDiscount(d: any): any {
  if (!d) return d;
  return {
    id: d.id, name: d.name, type: d.type || 'percentage',
    value: Number(d.value || 0), priority: d.priority || 1,
    category: d.category || '',
    category_name: (CATEGORIES.find((c: any) => c.id === d.category) || {}).name || d.category || '',
    brand_id: d.brandId || '', brand_name: (d.brand && d.brand.name) || '',
    location_id: d.locationId || '', location_name: (d.location && d.location.name) || 'All locations',
    starts_at: d.startsAt ? String(d.startsAt).slice(0, 10) : '',
    ends_at: d.endsAt ? String(d.endsAt).slice(0, 10) : '',
    apply_price_groups: d.applyPriceGroups !== false,
    apply_customer_groups: !!d.applyCustomerGroups,
    is_active: d.isActive !== false,
    _real: d,
  };
}
function toRealDiscountBody(f: any): any {
  const b: any = {};
  if (f.name !== undefined) b.name = f.name;
  if (f.type !== undefined) b.type = f.type;
  if (f.value !== undefined) b.value = Number(f.value || 0);
  if (f.priority !== undefined) b.priority = Number(f.priority || 1);
  if (f.category !== undefined) b.category = f.category || null;
  if (f.brand_id !== undefined) b.brand_id = isUuid(f.brand_id) ? f.brand_id : null;
  if (f.location_id !== undefined) b.location_id = isUuid(f.location_id) ? f.location_id : null;
  if (f.starts_at !== undefined) b.starts_at = f.starts_at || null;
  if (f.ends_at !== undefined) b.ends_at = f.ends_at || null;
  if (f.apply_price_groups !== undefined) b.apply_price_groups = f.apply_price_groups;
  if (f.apply_customer_groups !== undefined) b.apply_customer_groups = f.apply_customer_groups;
  if (f.is_active !== undefined) b.is_active = f.is_active;
  return b;
}
function adaptRealCoupon(c: any): any {
  return {
    id: c.id, code: c.code, description: c.description || '', type: c.type, value: Number(c.value || 0),
    min_purchase: Number(c.minPurchase || 0), max_uses: c.maxUses, used_count: c.usedCount || 0,
    per_customer_limit: c.perCustomerLimit, valid_from: c.validFrom ? String(c.validFrom).slice(0, 10) : '',
    valid_until: c.validUntil ? String(c.validUntil).slice(0, 10) : '', is_active: c.isActive,
  };
}
function adaptRealTask(t: any): any {
  if (!t) return t;
  return {
    id: t.id, title: t.title, description: t.description || '',
    status: t.status, priority: t.priority, category: t.category,
    due_date: t.dueDate ? String(t.dueDate).slice(0, 10) : '',
    assignee: (t.assignee && t.assignee.name) || '', assignee_id: t.assigneeId || null,
    project_id: t.projectId || null, project_name: (t.project && t.project.name) || '',
    _real: t,
  };
}
function adaptRealWholesaleOrder(o: any): any {
  if (!o) return o;
  return {
    id: o.id, order_number: o.orderNumber, customer_id: o.customerId,
    customer_name: (o.customer && o.customer.name) || '—', customer_phone: (o.customer && o.customer.phone) || '',
    status: o.status, payment_status: o.paymentStatus,
    total: Number(o.total || 0), amount_paid: Number(o.amountPaid || 0),
    outstanding: +(Number(o.total || 0) - Number(o.amountPaid || 0)).toFixed(2),
    driver_name: o.driverName || '', delivery_notes: o.deliveryNotes || '',
    date: o.createdAt ? String(o.createdAt).slice(0, 10) : '',
    items: Array.isArray(o.items) ? o.items.map((i: any) => ({ id: i.id, product_id: i.productId, product_name: (i.product && i.product.name) || '', quantity: i.quantity, unit_price: Number(i.unitPrice || 0), line_total: Number(i.lineTotal || 0), picked: !!i.picked })) : [],
  };
}
function toRealCouponBody(f: any): any {
  const b: any = {};
  if (f.code !== undefined) b.code = f.code;
  if (f.description !== undefined) b.description = f.description || undefined;
  if (f.type !== undefined) b.type = f.type;
  if (f.value !== undefined) b.value = Number(f.value || 0);
  if (f.min_purchase !== undefined) b.min_purchase = Number(f.min_purchase || 0);
  if (f.max_uses !== undefined) b.max_uses = f.max_uses ? Number(f.max_uses) : null;
  if (f.per_customer_limit !== undefined) b.per_customer_limit = Number(f.per_customer_limit || 1);
  if (f.valid_from !== undefined) b.valid_from = f.valid_from || null;
  if (f.valid_until !== undefined) b.valid_until = f.valid_until || null;
  if (f.is_active !== undefined) b.is_active = f.is_active;
  return b;
}

// ── Payment accounts (/api/v1/payment-accounts) ───────────────────────────────
function adaptRealPaymentAccount(a: any): any {
  if (!a) return a;
  return {
    id: a.id, name: a.name, type: a.type || 'Cash',
    account_number: a.accountNumber || '',
    balance: Number(a.balance || 0),
    _real: a,
  };
}
function toRealPaymentAccountBody(f: any): any {
  return {
    name: f.name,
    type: ['Cash', 'Bank', 'Mobile money', 'Other'].includes(f.type) ? f.type : 'Cash',
    account_number: f.account_number || undefined,
    balance: Number(f.balance || 0),
  };
}

// ── Stock adjustments (/api/v1/stock/adjustments) ─────────────────────────────
// The backend stores one row per product; the screen models a multi-line
// adjustment. We surface each backend row as a single-line adjustment and split
// the screen's lines into N create calls. Backend types map to normal/abnormal.
const ABNORMAL_ADJ_TYPES = new Set(['theft', 'damage', 'write_off']);
function adaptRealAdjustment(a: any): any {
  if (!a) return a;
  const q = Math.abs(Number(a.quantity || 0));
  const cost = Number((a.product && a.product.costPrice) || 0);
  return {
    id: a.id,
    ref: 'ADJ-' + String(a.id || '').replace(/-/g, '').slice(0, 6).toUpperCase(),
    location_id: a.locationId, location_name: (a.location && a.location.name) || '—',
    type: ABNORMAL_ADJ_TYPES.has(a.type) ? 'abnormal' : 'normal',
    reason: a.reason || '',
    item_count: q,
    total_value: Number(a.totalValue || 0) || q * cost,
    date: a.createdAt ? String(a.createdAt).slice(0, 10) : '',
    status: a.status,
    lines: [{ product_id: a.productId, product_name: (a.product && a.product.name) || '', qty: q }],
    _real: a,
  };
}

// ── Sale detail (/api/v1/sales/:id) → expose sell_lines for the returns modal ──
// Carries sale_item_id + real product uuid so a refund can be posted per line.
function adaptRealSaleDetail(s: any): any {
  if (!s) return s;
  const items = Array.isArray(s.items) ? s.items : [];
  return {
    ...s,
    sell_lines: items.map((it: any) => ({
      sale_item_id: it.id,
      product_id_real: it.productId,
      product_name: (it.product && it.product.name) || '',
      product_id: 0,                 // numeric id is only meaningful in mock mode
      quantity: Number(it.quantity || 0),
      quantity_returned: 0,          // backend doesn't track per-line refunds
      unit_price: Number(it.unitPrice || 0),
    })),
  };
}

// ── Dashboard (/api/v1/reports/dashboard) → the DASH-shaped view-model ─────────
function adaptRealDashboard(d: any): any {
  if (!d) return d;
  const cash = Number(d.cash_today || 0), zaad = Number(d.zaad_today || 0), card = Number(d.card_today || 0);
  const tx = Number(d.transactions_today || 0), today = Number(d.sales_today || 0);
  return {
    salesToday: today, txToday: tx, salesTrend: 0,
    salesMonth: Number(d.sales_month || 0), monthTrend: 0,
    stockValue: Number(d.stock_value || 0), products: Number(d.total_products || 0),
    avgBasket: tx ? today / tx : 0, basketTrend: 0,
    lowStock: Number(d.low_stock_count || 0),
    byPayment: [
      { id: 'cash', label: 'Cash', value: cash, color: '#0E9F6E' },
      { id: 'zaad', label: 'Zaad', value: zaad, color: '#1B3A6B' },
      { id: 'card', label: 'Card', value: card, color: '#A16207' },
    ],
    // Real today-by-hour from the backend (8:00–21:00 buckets); neutral fallback.
    hourly: Array.isArray(d.hourly) && d.hourly.length ? d.hourly.map((v: any) => Number(v) || 0) : new Array(14).fill(0),
    topProducts: (d.top_products || []).map((p: any) => ({ name: p.name, qty: Number(p.units_sold || 0), revenue: Number(p.revenue || 0) })),
    recentSales: (d.recent_sales || []).map((s: any) => ({
      id: s.saleNumber || s.id,
      customer: (s.customer && s.customer.name) || 'Walk-in',
      method: s.paymentMethod, methodLabel: s.paymentMethod,
      total: Number(s.totalAmount || 0),
      minsAgo: s.createdAt ? Math.max(0, Math.round((Date.now() - new Date(s.createdAt).getTime()) / 60000)) : 0,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC API  —  what every screen imports.
//  One method per endpoint; the name says which URL it hits.
// ═══════════════════════════════════════════════════════════════════
const API: any = {
  config: {
    get: () => ({ ...API_CONFIG }),
    set: (patch: any) => { Object.assign(API_CONFIG, patch); persistApiCfg(); if (hasWindow()) window.dispatchEvent(new CustomEvent('bz-api-cfg', { detail: { ...API_CONFIG } })); },
    isMock: () => API_CONFIG.mode === 'mock',
    isLive: () => API_CONFIG.mode === 'live',
    isReal: () => REAL_MODE,   // talking to the real /api/v1 backend
    log: () => API_LOG.slice(),
  },

  // POST /oauth/token   (OAuth2 password grant — Laravel Passport)
  auth: {
    async login(username: any, password: any) {
      if (REAL_MODE) {
        // backend: POST /api/v1/auth/login { email, password }
        //  → { user, access_token, refresh_token }  OR  { mfa_required: true, pre_token }
        const res = await realReq('POST', '/auth/login', { auth: false, body: { email: username, password } });
        if (res && res.access_token) setTokens(res.access_token, res.refresh_token);
        return res;
      }
      const res = await transport('POST', '/oauth/token', {
        auth: false,
        body: { grant_type: 'password', client_id: 1, client_secret: 'mock-secret', username, password, scope: '*' },
      });
      API.config.set({ token: res.access_token });
      return res;
    },
    // POST /api/v1/auth/register { businessName, email, password, phone?, country? }
    async register(payload: any) {
      const res = await realReq('POST', '/auth/register', { auth: false, body: payload });
      setTokens(res.access_token, res.refresh_token);
      return res;
    },
    logout() {
      if (REAL_MODE) { try { realReq('POST', '/auth/logout', {}); } catch (e) {} clearTokens(); return; }
      API.config.set({ token: null });
    },
    // Complete an MFA challenge: exchange the pre-auth token + TOTP code for real
    // tokens. Returns the same shape as a normal login.
    async mfaVerify(preToken: any, code: any) {
      const res = await realReq('POST', '/auth/mfa/verify', { auth: false, bearer: preToken, body: { token: String(code) } });
      if (res && res.access_token) setTokens(res.access_token, res.refresh_token);
      return res;
    },
    // Password recovery (real backend only; mock returns a friendly no-op).
    async forgotPassword(email: any) {
      if (REAL_MODE) return await realReq('POST', '/auth/forgot-password', { auth: false, body: { email } });
      return { message: 'If that email is registered, a reset link has been sent.' };
    },
    async resetPassword(token: any, newPassword: any) {
      if (REAL_MODE) return await realReq('POST', '/auth/reset-password', { auth: false, body: { token, newPassword } });
      return { message: 'Password reset successfully.' };
    },
    async changePassword(currentPassword: any, newPassword: any) {
      if (REAL_MODE) return await realReq('POST', '/auth/change-password', { body: { currentPassword, newPassword } });
      throw new ApiError(501, 'Changing your password needs the live backend.');
    },
    // MFA enrolment: setup() returns { secret, qr_code }; enable(code) confirms it.
    async mfaSetup() {
      if (REAL_MODE) return await realReq('POST', '/auth/mfa/setup', { body: {} });
      throw new ApiError(501, 'Two-factor auth needs the live backend.');
    },
    async mfaEnable(code: any) {
      if (REAL_MODE) return await realReq('POST', '/auth/mfa/enable', { body: { token: String(code) } });
      throw new ApiError(501, 'Two-factor auth needs the live backend.');
    },
    async mfaDisable(password: any) {
      if (REAL_MODE) return await realReq('POST', '/auth/mfa/disable', { body: { password } });
      throw new ApiError(501, 'Two-factor auth needs the live backend.');
    },
    // Switch/unlock the till by PIN within the current business → new tokens.
    async pinLogin(pin: any, businessId: any) {
      if (REAL_MODE) {
        const res = await realReq('POST', '/auth/pin-login', { auth: false, body: { pin: String(pin), business_id: businessId } });
        if (res && res.access_token) setTokens(res.access_token, res.refresh_token);
        return res;
      }
      throw new ApiError(501, 'PIN sign-in needs the live backend.');
    },
    // The signed-in identity (business + user). Null in mock mode so the shell
    // falls back to the seed BUSINESS/CASHIER.
    async me() {
      if (REAL_MODE) { try { return await realReq('GET', '/auth/me'); } catch (e) { return null; } }
      return null;
    },
  },

  // GET /connector/api/product
  product: {
    async list(params: any = {}) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/products', { query: params });
        const arr = (res && (res.products || res.data)) || [];
        return { items: (Array.isArray(arr) ? arr : []).map(adaptRealProduct), meta: res.meta };
      }
      const res = await transport('GET', '/connector/api/product', { query: params });
      return { items: res.data.map(adaptProduct), meta: res.meta };
    },
    async get(id: any) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/products/' + id);
        return adaptRealProduct((res && res.product) || res);
      }
      const res = await transport('GET', '/connector/api/product/' + numId(id));
      return adaptProduct(res.data[0]);
    },
    async create(payload: any) {
      if (REAL_MODE) {
        const res = await realReq('POST', '/products', { body: toRealProductBody(payload) });
        return adaptRealProduct((res && (res.product || res.data)) || res);
      }
      const res = await transport('POST', '/connector/api/product', { body: payload });
      return adaptProduct(res.data[0]);
    },
    async update(id: any, payload: any) {
      if (REAL_MODE) {
        const res = await realReq('PUT', '/products/' + id, { body: toRealProductBody(payload) });
        return adaptRealProduct((res && (res.product || res.data)) || res);
      }
      const res = await transport('PUT', '/connector/api/product/' + numId(id), { body: payload });
      return adaptProduct(res.data[0]);
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/products/' + id);
      return (await transport('DELETE', '/connector/api/product/' + numId(id))).data;
    },
  },

  // Categories — real backend has /api/v1/categories; the mock screens read the
  // seed CATEGORIES directly, so the mock branch just returns an empty list.
  category: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/categories');
        const arr = (res && (res.categories || res.data)) || (Array.isArray(res) ? res : []);
        (Array.isArray(arr) ? arr : []).forEach((c: any) => { if (c && c.name) REAL_CAT_BY_NAME[c.name] = c.id; });
        // id = name so screens' `category.id === product.cat` grouping holds.
        return (Array.isArray(arr) ? arr : []).map((c: any) => ({ id: c.name, name: c.name, color: c.color || '#D9C9A3', uid: c.id, count: c.product_count ?? c._count?.products }));
      }
      return [];
    },
  },

  // Catalog reference data
  unit: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/units');
        return ((res && (res.units || res.data)) || []).map((u: any) => ({ id: u.id, actual_name: u.actualName, short_name: u.shortName, allow_decimal: u.allowDecimal ? 1 : 0 }));
      }
      return (await transport('GET', '/connector/api/unit')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/units', { body: { actual_name: body.actual_name, short_name: body.short_name, allow_decimal: !!body.allow_decimal } });
      return (await transport('POST', '/connector/api/unit', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return await realReq('PUT', '/units/' + id, { body: { actual_name: body.actual_name, short_name: body.short_name, allow_decimal: body.allow_decimal } });
      return (await transport('PUT', '/connector/api/unit/' + id, { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/units/' + id);
      return (await transport('DELETE', '/connector/api/unit/' + id)).data;
    },
  },
  brand: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/brands');
        return ((res && (res.brands || res.data)) || []).map((b: any) => ({ id: b.id, name: b.name }));
      }
      return (await transport('GET', '/connector/api/brand')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/brands', { body: { name: body.name } });
      return (await transport('POST', '/connector/api/brand', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/brands/' + id);
      return (await transport('DELETE', '/connector/api/brand/' + id)).data;
    },
  },
  variation: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/variations');
        return ((res && (res.variations || res.data)) || []).map((v: any) => ({ id: v.id, name: v.name, values: (v.values || []).map((name: any, i: number) => ({ id: i + 1, name })) }));
      }
      return (await transport('GET', '/connector/api/variation')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/variations', { body: { name: body.name, values: body.values || [] } });
      return (await transport('POST', '/connector/api/variation', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/variations/' + id);
      return (await transport('DELETE', '/connector/api/variation/' + id)).data;
    },
  },
  taxRate: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/tax/rates');
        return ((res && (res.rates || res.data)) || []).map(adaptRealTaxRate);
      }
      return (await transport('GET', '/connector/api/tax')).data;
    },
    // Tax groups have no /api/v1 equivalent yet — return none in real mode so the
    // settings screen renders without firing a request that would 404.
    async groups() { if (REAL_MODE) return []; return (await transport('GET', '/connector/api/tax-group')).data; },
    async createGroup(body: any) { return (await transport('POST', '/connector/api/tax-group', { body })).data; },
    async removeGroup(id: any) { return (await transport('DELETE', '/connector/api/tax-group/' + id)).data; },
  },
  stockAdjustment: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/stock/adjustments');
        return (Array.isArray(res) ? res : (res.adjustments || res.data || [])).map(adaptRealAdjustment);
      }
      return (await transport('GET', '/connector/api/stock-adjustment')).data;
    },
    async create(body: any) {
      if (REAL_MODE) {
        // One backend row per line; quantity is negative (stock reduction). Approve
        // immediately so stock updates (matches the mock) — skipped silently if the
        // user lacks the owner/manager role the approve step requires.
        const beType = body.type === 'abnormal' ? 'damage' : 'loss';
        let created = 0;
        for (const l of (body.lines || [])) {
          const adj = await realReq('POST', '/stock/adjustments', { body: {
            product_id: l.product_id,
            location_id: isUuid(body.location_id) ? body.location_id : undefined,
            type: beType,
            quantity: -Math.abs(Number(l.qty || 0)),
            reason: body.reason || undefined,
          }});
          if (adj && adj.id) { try { await realReq('POST', '/stock/adjustments/' + adj.id + '/approve'); } catch (e) {} }
          created++;
        }
        return { created };
      }
      return (await transport('POST', '/connector/api/stock-adjustment', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) throw new ApiError(501, 'Adjustments can’t be deleted (audit trail).');
      return (await transport('DELETE', '/connector/api/stock-adjustment/' + id)).data;
    },
  },

  // /connector/api/sell
  sell: {
    async list(params: any = {}) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/sales', { query: params });
        return { items: (res && (res.sales || res.data)) || [], meta: res.meta };
      }
      const res = await transport('GET', '/connector/api/sell', { query: params });
      return { items: res.data, meta: res.meta };
    },
    async get(id: any) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/sales/' + id);
        return adaptRealSaleDetail((res && (res.sale || res.data)) || res);
      }
      const res = await transport('GET', '/connector/api/sell/' + numId(id));
      return res.data[0];
    },
    async create(payload: any) {
      if (REAL_MODE) {
        const pays = (payload.payments || []).filter((p: any) => Number(p.amount) > 0);
        const split = pays.length > 1;
        // The backend requires the idempotency key to be minted server-side first
        // (POST /sales/initiate) — it must already exist in sale_keys, otherwise
        // POST /sales rejects with "Invalid transaction token."
        const init = await realReq('POST', '/sales/initiate');
        const body: any = {
          idempotency_key: init.idempotency_key,
          items: (payload.lines || []).map((l: any) => ({ product_id: l.product_id, quantity: l.quantity, override_price: l.unit_price })),
          customer_id: isUuid(payload.contact_id) ? payload.contact_id : undefined,
          location_id: isUuid(payload.location_id) ? payload.location_id : undefined,
          shift_id: isUuid(payload.shift_id) ? payload.shift_id : undefined,  // attribute the sale to the open till
          payment_method: split ? 'split' : realPayMethod((pays[0] && pays[0].method) || payload.method),
          discount_type: payload.discount_type === 'percentage' ? 'pct' : 'flat',
          discount_value: Number(payload.discount_amount || 0),
          ...(payload.coupon_id ? { coupon_id: payload.coupon_id, coupon_discount: Number(payload.coupon_discount || 0) } : {}),
          ...(Number(payload.packing_charge) > 0 ? { packing_charge: Number(payload.packing_charge) } : {}),
          ...(isUuid(payload.service_type_id) ? { service_type_id: payload.service_type_id } : {}),
          type: 'pos',
        };
        if (split) {
          for (const p of pays) {
            const m = realPayMethod(p.method);
            if (m === 'cash') body.cash_amount = (body.cash_amount || 0) + Number(p.amount);
            else if (m === 'zaad') body.zaad_amount = (body.zaad_amount || 0) + Number(p.amount);
            else body.card_amount = (body.card_amount || 0) + Number(p.amount);
          }
        } else if (body.payment_method === 'cash') {
          body.cash_tendered = Number((pays[0] && pays[0].amount) || payload.amount || 0);
        }
        const res = await realReq('POST', '/sales', { body });
        const s = (res && (res.sale || res.data)) || res || {};
        return {
          invoice_no: s.invoice_no || s.invoiceNumber || s.invoice_number || s.id,
          change_return: Number(s.change_return ?? s.changeDue ?? s.change ?? 0),
          ...s,
        };
      }
      const sell = {
        location_id: payload.location_id || 1,
        contact_id: payload.contact_id || 1,
        customer_name: payload.customer_name,
        status: 'final', source: 'api',
        transaction_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
        discount_amount: payload.discount_amount || 0,
        discount_type: payload.discount_type || 'fixed',
        tax_amount: payload.tax_amount || 0,
        method: payload.method,
        redeem_points: payload.redeem_points || 0,
        products: payload.lines.map((l: any) => ({ product_id: numId(l.product_id), variation: l.variation || null, quantity: l.quantity, unit_price: l.unit_price })),
        payments: payload.payments || [{ amount: payload.amount, method: payload.method }],
      };
      const res = await transport('POST', '/connector/api/sell', { body: { sells: [sell] } });
      return res.data[0];
    },
  },

  // Sell returns → backend refund (/api/v1/sales/:id/refund)
  sellReturn: {
    async create(payload: any) {
      if (REAL_MODE) {
        const items = (payload.products || []).map((p: any) => ({
          sale_item_id: p.sale_item_id,
          product_id: p.product_id,
          quantity: Number(p.quantity || 0),
          unit_price: Number(p.unit_price || 0),
          restock: p.restock !== false,
        }));
        return await realReq('POST', '/sales/' + payload.transaction_id + '/refund', { body: {
          items, reason: payload.reason || 'Customer return',
          refund_method: payload.refund_method || 'cash', restock: true,
        }});
      }
      const res = await transport('POST', '/connector/api/sell-return', { body: payload });
      return res.data;
    },
    async list(params: any = {}) {
      // Refunds are nested under sales on the backend — no standalone list yet.
      if (REAL_MODE) return { items: [], meta: null };
      const res = await transport('GET', '/connector/api/list-sell-return', { query: params });
      return { items: res.data, meta: res.meta };
    },
  },

  // Pharmacy (/api/v1/pharmacy) — gated by the pharmacy module. Real backend only.
  pharmacy: {
    async dashboard() { if (REAL_MODE) return await realReq('GET', '/pharmacy/dashboard'); return null; },
    async expiry(days?: any) { if (REAL_MODE) return await realReq('GET', '/pharmacy/expiry', { query: days ? { days } : undefined }); return { expired: [], urgent_30d: [], soon_90d: [], total_value_at_risk: 0 }; },
    async drugs(q?: any) { if (REAL_MODE) { const r = await realReq('GET', '/pharmacy/drugs', { query: q ? { q } : undefined }); return r.drugs || []; } return []; },
    async updateDrug(id: any, body: any) { if (REAL_MODE) return await realReq('PUT', '/pharmacy/drugs/' + id, { body }); throw new ApiError(501, 'Pharmacy needs the live backend.'); },
    async fastMovers(days?: any) { if (REAL_MODE) { const r = await realReq('GET', '/pharmacy/fast-movers', { query: days ? { days } : undefined }); return r.fast_movers || []; } return []; },
    async pullExpired(batchId: any, notes?: any) { if (REAL_MODE) return await realReq('POST', '/pharmacy/pull-expired', { body: { batch_id: batchId, notes } }); throw new ApiError(501, 'Pharmacy needs the live backend.'); },
  },

  // Wholesale (/api/v1/wholesale) — gated by the wholesale module. Real only.
  wholesale: {
    async orders(status?: any) {
      if (REAL_MODE) { const r = await realReq('GET', '/wholesale/orders', { query: status ? { status } : undefined }); return ((r && (r.orders || r.data)) || []).map(adaptRealWholesaleOrder); }
      return [];
    },
    async createOrder(body: any) {
      if (REAL_MODE) return adaptRealWholesaleOrder(await realReq('POST', '/wholesale/orders', { body: { customer_id: body.customer_id, items: body.items, delivery_notes: body.delivery_notes || undefined } }));
      throw new ApiError(501, 'Wholesale needs the live backend.');
    },
    async pick(id: any, itemIds: any[]) {
      if (REAL_MODE) return await realReq('POST', '/wholesale/orders/' + id + '/pick', { body: { item_ids: itemIds } });
      throw new ApiError(501, 'Wholesale needs the live backend.');
    },
    async dispatch(id: any, driver: any) {
      if (REAL_MODE) return await realReq('POST', '/wholesale/orders/' + id + '/dispatch', { body: { driver_name: driver } });
      throw new ApiError(501, 'Wholesale needs the live backend.');
    },
    async deliver(id: any) {
      if (REAL_MODE) return await realReq('POST', '/wholesale/orders/' + id + '/deliver', { body: {} });
      throw new ApiError(501, 'Wholesale needs the live backend.');
    },
    async payOrder(id: any, amount: any) {
      if (REAL_MODE) return await realReq('POST', '/wholesale/orders/' + id + '/payment', { body: { amount: Number(amount || 0) } });
      throw new ApiError(501, 'Wholesale needs the live backend.');
    },
    async outstanding() {
      if (REAL_MODE) { const r = await realReq('GET', '/wholesale/outstanding'); return (r && r.outstanding) || []; }
      return [];
    },
  },

  // Hotel / PMS (/api/v1/hotel) — gated by the hotel module. Real only.
  // The hotel backend takes camelCase request bodies, so pass them through as-is.
  hotel: {
    async dashboard() { if (REAL_MODE) return await realReq('GET', '/hotel/dashboard'); return null; },
    async rooms(params?: any) { if (REAL_MODE) return await realReq('GET', '/hotel/rooms', { query: params }); return { rooms: [], stats: {} }; },
    async setRoomStatus(id: any, status: any, notes?: any) { if (REAL_MODE) return await realReq('PUT', '/hotel/rooms/' + id + '/status', { body: { status, notes: notes || undefined } }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async roomTypes() { if (REAL_MODE) { const r = await realReq('GET', '/hotel/room-types'); return (r && r.room_types) || []; } return []; },
    async createRoomType(body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/room-types', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async createRoom(body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/rooms', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async reservations(params?: any) { if (REAL_MODE) return await realReq('GET', '/hotel/reservations', { query: params }); return { reservations: [], summary: {} }; },
    async createReservation(body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/reservations', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async checkin(id: any) { if (REAL_MODE) return await realReq('POST', '/hotel/reservations/' + id + '/checkin', { body: {} }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async checkout(id: any, body?: any) { if (REAL_MODE) return await realReq('POST', '/hotel/reservations/' + id + '/checkout', { body: body || {} }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async cancelReservation(id: any, reason?: any) { if (REAL_MODE) return await realReq('DELETE', '/hotel/reservations/' + id, { body: { reason } }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async housekeeping(params?: any) { if (REAL_MODE) { const r = await realReq('GET', '/hotel/housekeeping', { query: params }); return (r && r.tasks) || []; } return []; },
    async updateHousekeeping(id: any, status: any) { if (REAL_MODE) return await realReq('PUT', '/hotel/housekeeping/' + id, { body: { status } }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    // Folio — the guest's running bill (charges + payments → balance).
    async folio(id: any) { if (REAL_MODE) return await realReq('GET', '/hotel/folios/' + id); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async addCharge(id: any, body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/folios/' + id + '/charges', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async folioPayment(id: any, body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/folios/' + id + '/payments', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    // Corporate accounts (negotiated-rate company billing) + month-end invoice.
    async corporate() { if (REAL_MODE) { const r = await realReq('GET', '/hotel/corporate'); return (r && r.accounts) || []; } return []; },
    async createCorporate(body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/corporate', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async corporateInvoice(id: any, params: any) { if (REAL_MODE) return await realReq('GET', '/hotel/corporate/' + id + '/invoice', { query: params }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    // Group bookings (a block of rooms under one organiser).
    async groups(params?: any) { if (REAL_MODE) { const r = await realReq('GET', '/hotel/groups', { query: params }); return (r && r.groups) || []; } return []; },
    async createGroup(body: any) { if (REAL_MODE) return await realReq('POST', '/hotel/groups', { body }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async group(id: any) { if (REAL_MODE) return await realReq('GET', '/hotel/groups/' + id); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async addToGroup(id: any, reservationId: any) { if (REAL_MODE) return await realReq('POST', '/hotel/groups/' + id + '/reservations', { body: { reservationId } }); throw new ApiError(501, 'Hotel needs the live backend.'); },
    async groupCheckin(id: any) { if (REAL_MODE) return await realReq('POST', '/hotel/groups/' + id + '/checkin', { body: {} }); throw new ApiError(501, 'Hotel needs the live backend.'); },
  },

  // Construction (/api/v1/construction) — project-centric job costing, gated by
  // the construction module. Projects come from the ungated /projects router.
  construction: {
    async projects() { if (REAL_MODE) { const r = await realReq('GET', '/projects'); return ((r && (r.projects || r.data)) || []); } return []; },
    async createProject(body: any) { if (REAL_MODE) return await realReq('POST', '/projects', { body }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async costing(pid: any) { if (REAL_MODE) return await realReq('GET', '/construction/' + pid + '/costing'); throw new ApiError(501, 'Construction needs the live backend.'); },
    async addBudgetLine(pid: any, body: any) { if (REAL_MODE) return await realReq('POST', '/construction/' + pid + '/budget-lines', { body }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async recordCost(lineId: any, amount: any) { if (REAL_MODE) return await realReq('POST', '/construction/budget-lines/' + lineId + '/cost', { body: { amount: Number(amount || 0) } }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async updateBudgetLine(lineId: any, body: any) { if (REAL_MODE) return await realReq('PUT', '/construction/budget-lines/' + lineId, { body }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async deleteBudgetLine(lineId: any) { if (REAL_MODE) return await realReq('DELETE', '/construction/budget-lines/' + lineId); throw new ApiError(501, 'Construction needs the live backend.'); },
    async labor(pid: any) { if (REAL_MODE) return await realReq('GET', '/construction/' + pid + '/labor'); return { entries: [], total: 0 }; },
    async logLabor(pid: any, body: any) { if (REAL_MODE) return await realReq('POST', '/construction/' + pid + '/labor', { body }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async siteLogs(pid: any) { if (REAL_MODE) { const r = await realReq('GET', '/construction/' + pid + '/site-log'); return (r && r.logs) || []; } return []; },
    async addSiteLog(pid: any, body: any) { if (REAL_MODE) return await realReq('POST', '/construction/' + pid + '/site-log', { body }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async milestones(pid: any) { if (REAL_MODE) { const r = await realReq('GET', '/construction/' + pid + '/milestones'); return (r && r.milestones) || []; } return []; },
    async addMilestone(pid: any, body: any) { if (REAL_MODE) return await realReq('POST', '/construction/' + pid + '/milestones', { body }); throw new ApiError(501, 'Construction needs the live backend.'); },
    async setMilestoneStatus(msId: any, status: any) { if (REAL_MODE) return await realReq('PUT', '/construction/milestones/' + msId + '/status', { body: { status } }); throw new ApiError(501, 'Construction needs the live backend.'); },
  },

  // Tasks (/api/v1/tasks) — used by the Construction per-project task board.
  task: {
    async list(params: any = {}) { if (REAL_MODE) { const r = await realReq('GET', '/tasks', { query: params }); return ((r && r.tasks) || []).map(adaptRealTask); } return []; },
    async create(body: any) { if (REAL_MODE) return adaptRealTask(await realReq('POST', '/tasks', { body })); throw new ApiError(501, 'Tasks need the live backend.'); },
    async update(id: any, body: any) { if (REAL_MODE) return adaptRealTask(await realReq('PUT', '/tasks/' + id, { body })); throw new ApiError(501, 'Tasks need the live backend.'); },
  },

  // Receipts (/api/v1/checkout) — real backend only; mock mode is a no-op.
  receipt: {
    async pdf(saleId: any) {
      if (!REAL_MODE) throw new ApiError(501, 'Receipts need the live backend.');
      const headers: any = { Accept: 'application/pdf' };
      const tok = getAccessToken(); if (tok) headers.Authorization = 'Bearer ' + tok;
      const res = await fetch(BACKEND_BASE + '/api/v1/checkout/receipt/' + saleId + '/pdf', { headers });
      if (!res.ok) throw new ApiError(res.status, 'Could not generate the receipt PDF.');
      const url = URL.createObjectURL(await res.blob());
      if (hasWindow()) window.open(url, '_blank');
      return url;
    },
    async whatsapp(saleId: any, phone?: any) {
      if (!REAL_MODE) throw new ApiError(501, 'Receipts need the live backend.');
      return await realReq('POST', '/checkout/receipt/' + saleId + '/send-whatsapp', { body: phone ? { phone } : {} });
    },
    async email(saleId: any, email: any) {
      if (!REAL_MODE) throw new ApiError(501, 'Receipts need the live backend.');
      return await realReq('POST', '/checkout/receipt/' + saleId + '/send-email', { body: { email } });
    },
  },

  // GET /connector/api/contactapi
  contact: {
    async list(params: any = {}) {
      if (REAL_MODE) {
        if (params.type === 'supplier') {
          const res = await realReq('GET', '/suppliers');
          return ((res && (res.suppliers || res.data)) || []).map(adaptRealSupplier);
        }
        const res = await realReq('GET', '/customers', { query: params });
        return ((res.customers || res.data) || []).map(adaptRealCustomer);
      }
      return (await transport('GET', '/connector/api/contactapi', { query: params })).data;
    },
    async get(id: any) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/customers/' + id);
        return adaptRealCustomer((res && (res.customer || res.data)) || res);
      }
      return (await transport('GET', '/connector/api/contactapi/' + id)).data[0];
    },
    async create(body: any) {
      if (REAL_MODE) {
        if (body.type === 'supplier') return adaptRealSupplier(await realReq('POST', '/suppliers', { body: toRealSupplierBody(body) }));
        return adaptRealCustomer(await realReq('POST', '/customers', { body: toRealCustomerBody(body) }));
      }
      return (await transport('POST', '/connector/api/contactapi', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) {
        if (body.type === 'supplier') return adaptRealSupplier(await realReq('PUT', '/suppliers/' + id, { body: toRealSupplierBody(body) }));
        return adaptRealCustomer(await realReq('PUT', '/customers/' + id, { body: toRealCustomerBody(body) }));
      }
      return (await transport('PUT', '/connector/api/contactapi/' + id, { body })).data;
    },
    async remove(id: any, row?: any) {
      if (REAL_MODE) {
        // Suppliers soft-delete via isActive; customers have no delete endpoint yet.
        if (row && row.type === 'supplier') return await realReq('PUT', '/suppliers/' + id, { body: { is_active: false } });
        throw new ApiError(405, 'Deleting customers isn’t supported yet.');
      }
      return (await transport('DELETE', '/connector/api/contactapi/' + id)).data;
    },
    async ledger(id: any) {
      // No unified contact-ledger endpoint on /api/v1 yet — return an empty ledger
      // so the contact drawer renders instead of erroring.
      if (REAL_MODE) return { contact: null, ledger: [] };
      return (await transport('GET', '/connector/api/contact-ledger/' + id)).data;
    },
    async pay(body: any) {
      if (REAL_MODE) {
        // Customer repayments map to the credit endpoint; supplier payments are
        // recorded against POs, so there's no generic supplier path yet.
        if (body.kind === 'receive' && isUuid(body.contact_id)) {
          return await realReq('POST', '/sales/customer-payment', { body: {
            customer_id: body.contact_id, amount: Number(body.amount),
            payment_method: realPayMethod(body.method), notes: body.note || undefined,
          }});
        }
        throw new ApiError(501, 'Recording this payment isn’t supported yet.');
      }
      return (await transport('POST', '/connector/api/contact-payment', { body })).data;
    },
  },
  customerGroup: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/customer-groups');
        return ((res && (res.groups || res.data)) || []).map((g: any) => ({ id: g.id, name: g.name, amount: Number(g.discountPct || 0), member_count: (g._count && g._count.customers) || 0 }));
      }
      return (await transport('GET', '/connector/api/customer-group')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/customer-groups', { body: { name: body.name, amount: Number(body.amount || 0) } });
      return (await transport('POST', '/connector/api/customer-group', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/customer-groups/' + id);
      return (await transport('DELETE', '/connector/api/customer-group/' + id)).data;
    },
  },
  user: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/users');
        return ((res && (res.users || res.data)) || []).map(adaptRealUser);
      }
      return (await transport('GET', '/connector/api/user')).data;
    },
    async get(id: any) {
      if (REAL_MODE) {
        // No GET /users/:id on the backend — find it in the list.
        const res = await realReq('GET', '/users');
        const u = ((res && (res.users || res.data)) || []).find((x: any) => x.id === id);
        return u ? adaptRealUser(u) : null;
      }
      return (await transport('GET', '/connector/api/user/' + id)).data[0];
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealUser(await realReq('POST', '/users', { body: toRealCreateUserBody(body) }));
      return (await transport('POST', '/connector/api/user', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return adaptRealUser(await realReq('PUT', '/users/' + id, { body: toRealUpdateUserBody(body) }));
      return (await transport('PUT', '/connector/api/user/' + id, { body })).data;
    },
    async remove(id: any, row?: any) {
      if (REAL_MODE) {
        // No DELETE on the backend — deactivate instead (the PUT needs name+role).
        return adaptRealUser(await realReq('PUT', '/users/' + id, { body: {
          name: (row && row.name) || 'User', role: roleKeyById(row && row.role_id), is_active: false,
        }}));
      }
      return (await transport('DELETE', '/connector/api/user/' + id)).data;
    },
  },
  role: {
    // The backend has fixed enum roles, not editable Role entities. Read works;
    // create/update/remove aren't supported (kept honest rather than silently failing).
    async list() {
      if (REAL_MODE) return REAL_ROLES.map((r: any) => ({ id: r.id, name: r.name, location_access: 'all', permissions: [] }));
      return (await transport('GET', '/connector/api/role')).data;
    },
    async get(id: any) {
      if (REAL_MODE) { const r = REAL_ROLES.find((x: any) => x.id === Number(id)) || {}; return { ...r, location_access: 'all', permissions: [] }; }
      return (await transport('GET', '/connector/api/role/' + id)).data[0];
    },
    async create(_body: any) { if (REAL_MODE) throw new ApiError(501, 'Custom roles aren’t supported yet — users use built-in roles.'); return (await transport('POST', '/connector/api/role', { body: _body })).data; },
    async update(id: any, _body: any) { if (REAL_MODE) throw new ApiError(501, 'Built-in roles can’t be edited.'); return (await transport('PUT', '/connector/api/role/' + id, { body: _body })).data; },
    async remove(id: any) { if (REAL_MODE) throw new ApiError(501, 'Built-in roles can’t be deleted.'); return (await transport('DELETE', '/connector/api/role/' + id)).data; },
  },
  permissions: { async list() { if (REAL_MODE) return []; return (await transport('GET', '/connector/api/permission-list')).data; } },
  location: {
    async list(opts: any = {}) {
      if (REAL_MODE) {
        // Management screen passes { all: true } to also see disabled locations;
        // POS dropdowns omit it and get active-only.
        const res = await realReq('GET', '/locations', { query: opts.all ? { all: 1 } : undefined });
        return ((res && (res.locations || res.data)) || []).map(adaptRealLocation);
      }
      return (await transport('GET', '/connector/api/business-location')).data;
    },
    async get(id: any) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/locations', { query: { all: 1 } });
        const l = ((res && (res.locations || res.data)) || []).find((x: any) => x.id === id);
        return l ? adaptRealLocation(l) : null;
      }
      return (await transport('GET', '/connector/api/business-location/' + id)).data[0];
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealLocation(await realReq('POST', '/locations', { body: toRealLocationBody(body) }));
      return (await transport('POST', '/connector/api/business-location', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return adaptRealLocation(await realReq('PUT', '/locations/' + id, { body: toRealLocationBody(body) }));
      return (await transport('PUT', '/connector/api/business-location/' + id, { body })).data;
    },
    async setStatus(id: any, status: any) {
      if (REAL_MODE) return adaptRealLocation(await realReq('PUT', '/locations/' + id, { body: { is_active: status === 'active' } }));
      return (await transport('PUT', '/connector/api/business-location/' + id + '/status', { body: { status } })).data;
    },
  },
  invoiceScheme: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/invoice-schemes');
        return ((res && (res.schemes || res.data)) || []).map((s: any) => ({ id: s.id, name: s.name, prefix: s.prefix || '', start_number: s.startNumber, total_digits: s.totalDigits }));
      }
      return (await transport('GET', '/connector/api/invoice-scheme')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/invoice-schemes', { body: { name: body.name, prefix: body.prefix || undefined, start_number: Number(body.start_number || 1), total_digits: Number(body.total_digits || 4) } });
      return (await transport('POST', '/connector/api/invoice-scheme', { body })).data;
    },
  },
  invoiceLayout: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/invoice-layouts');
        return ((res && (res.layouts || res.data)) || []).map(adaptRealInvoiceLayout);
      }
      return (await transport('GET', '/connector/api/invoice-layout')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealInvoiceLayout(await realReq('POST', '/invoice-layouts', { body: { name: body.name } }));
      return (await transport('POST', '/connector/api/invoice-layout', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return adaptRealInvoiceLayout(await realReq('PUT', '/invoice-layouts/' + id, { body: toRealInvoiceLayoutBody(body) }));
      return (await transport('PUT', '/connector/api/invoice-layout/' + id, { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/invoice-layouts/' + id);
      return (await transport('DELETE', '/connector/api/invoice-layout/' + id)).data;
    },
  },
  priceGroup: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/price-groups');
        return ((res && (res.priceGroups || res.groups || res.data)) || []).map((g: any) => ({ id: g.id, name: g.name, percent: Number(g.percent || 0), is_default: !!g.isDefault }));
      }
      return (await transport('GET', '/connector/api/selling-price-group')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/price-groups', { body: { name: body.name, percent: Number(body.percent || 0) } });
      return (await transport('POST', '/connector/api/selling-price-group', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/price-groups/' + id);
      return (await transport('DELETE', '/connector/api/selling-price-group/' + id)).data;
    },
  },
  paymentMethod: { async list() { return (await transport('GET', '/connector/api/payment-method')).data; } },
  discount: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/discounts');
        return ((res && (res.discounts || res.data)) || []).map(adaptRealDiscount);
      }
      return (await transport('GET', '/connector/api/discount')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealDiscount(await realReq('POST', '/discounts', { body: toRealDiscountBody(body) }));
      return (await transport('POST', '/connector/api/discount', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return adaptRealDiscount(await realReq('PUT', '/discounts/' + id, { body: toRealDiscountBody(body) }));
      return (await transport('PUT', '/connector/api/discount/' + id, { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/discounts/' + id);
      return (await transport('DELETE', '/connector/api/discount/' + id)).data;
    },
  },
  serviceType: {
    // /api/v1/service-types is gated by the restaurant module → 404/403 falls
    // back to an empty list so the POS selector simply hides when unavailable.
    async list(opts: any = {}) {
      if (REAL_MODE) { try { return await realReq('GET', '/service-types', { query: opts.all ? { all: 1 } : undefined }); } catch (e) { return []; } }
      return (await transport('GET', '/connector/api/types-of-service')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return await realReq('POST', '/service-types', { body: { name: body.name, packing_charge: Number(body.packing_charge || 0), packing_charge_type: body.packing_charge_type || 'fixed' } });
      return (await transport('POST', '/connector/api/types-of-service', { body })).data;
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return await realReq('PUT', '/service-types/' + id, { body });
      return (await transport('PUT', '/connector/api/types-of-service/' + id, { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/service-types/' + id);
      return (await transport('DELETE', '/connector/api/types-of-service/' + id)).data;
    },
  },
  module: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/modules');
        return adaptRealModules((res && res.catalog) || []);
      }
      return (await transport('GET', '/connector/api/module')).data;
    },
    async setEnabled(key: any, enabled: any) {
      if (REAL_MODE) {
        // Backend PUT /modules takes the FULL enabled set, validated against its
        // own catalog — so read current state, toggle, and send back known keys.
        const res = await realReq('GET', '/modules');
        const cat = (res && res.catalog) || [];
        const cur = new Set(cat.filter((m: any) => m.enabled).map((m: any) => m.key));
        if (cat.some((m: any) => m.key === key)) { if (enabled) cur.add(key); else cur.delete(key); }
        await realReq('PUT', '/modules', { body: { enabledModules: [...cur] } });
        // Let the shell refresh which nav items show.
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('bz:modules-changed'));
        return { key, enabled };
      }
      return (await transport('PUT', '/connector/api/module/' + key, { body: { enabled } })).data;
    },
  },
  expense: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/expenses');
        return ((res && (res.expenses || res.data)) || []).map(adaptRealExpense);
      }
      return (await transport('GET', '/connector/api/expense')).data;
    },
    async categories() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/expense-categories');
        return ((res && (res.categories || res.data)) || []).map((c: any) => ({ id: c.id, name: c.name }));
      }
      return (await transport('GET', '/connector/api/expense-category')).data;
    },
    async addCategory(body: any) {
      if (REAL_MODE) return await realReq('POST', '/expense-categories', { body: { name: body.name } });
      return (await transport('POST', '/connector/api/expense-category', { body })).data;
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealExpense(await realReq('POST', '/expenses', { body: toRealExpenseBody(body) }));
      return (await transport('POST', '/connector/api/expense', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/expenses/' + id);
      return (await transport('DELETE', '/connector/api/expense/' + id)).data;
    },
  },
  paymentAccount: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/payment-accounts');
        return ((res && (res.accounts || res.data)) || []).map(adaptRealPaymentAccount);
      }
      return (await transport('GET', '/connector/api/payment-account')).data;
    },
    async types() {
      if (REAL_MODE) return ['Cash', 'Bank', 'Mobile money', 'Other'];
      return (await transport('GET', '/connector/api/account-type')).data;
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealPaymentAccount(await realReq('POST', '/payment-accounts', { body: toRealPaymentAccountBody(body) }));
      return (await transport('POST', '/connector/api/payment-account', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/payment-accounts/' + id);
      return (await transport('DELETE', '/connector/api/payment-account/' + id)).data;
    },
    async transfer(body: any) {
      if (REAL_MODE) return await realReq('POST', '/payment-accounts/transfer', { body: { from_id: body.from_id, to_id: body.to_id, amount: Number(body.amount) } });
      return (await transport('POST', '/connector/api/payment-account/transfer', { body })).data;
    },
    async deposit(id: any, amount: any) {
      if (REAL_MODE) return adaptRealPaymentAccount(await realReq('POST', '/payment-accounts/' + id + '/deposit', { body: { amount: Number(amount) } }));
      return (await transport('POST', '/connector/api/payment-account/' + id + '/deposit', { body: { amount } })).data;
    },
  },
  restaurant: {
    async tables() { return (await transport('GET', '/connector/api/restaurant/table')).data; },
    async addTable(body: any) { return (await transport('POST', '/connector/api/restaurant/table', { body })).data; },
    async setTable(id: any, body: any) { return (await transport('PUT', '/connector/api/restaurant/table/' + id, { body })).data; },
    async removeTable(id: any) { return (await transport('DELETE', '/connector/api/restaurant/table/' + id)).data; },
    async staff() { return (await transport('GET', '/connector/api/restaurant/staff')).data; },
    async addStaff(body: any) { return (await transport('POST', '/connector/api/restaurant/staff', { body })).data; },
    async removeStaff(id: any) { return (await transport('DELETE', '/connector/api/restaurant/staff/' + id)).data; },
    async modifiers() { return (await transport('GET', '/connector/api/restaurant/modifier')).data; },
    async addModifier(body: any) { return (await transport('POST', '/connector/api/restaurant/modifier', { body })).data; },
    async removeModifier(id: any) { return (await transport('DELETE', '/connector/api/restaurant/modifier/' + id)).data; },
    async kitchen() { return (await transport('GET', '/connector/api/restaurant/kitchen')).data; },
    async setKitchen(id: any, status: any) { return (await transport('PUT', '/connector/api/restaurant/kitchen/' + id, { body: { status } })).data; },
  },
  hrm: {
    // ── Phase 1: employees, org, settings, summary (wired to /api/v1/hrm) ──
    async summary() {
      if (REAL_MODE) return await realReq('GET', '/hrm/summary');
      return (await transport('GET', '/connector/api/hrm/summary')).data;
    },
    async employees() {
      if (REAL_MODE) return await realReq('GET', '/hrm/employee');
      return (await transport('GET', '/connector/api/hrm/employee')).data;
    },
    async employee(id: any) {
      if (REAL_MODE) return await realReq('GET', '/hrm/employee/' + id);
      return (await transport('GET', '/connector/api/hrm/employee/' + id)).data;
    },
    async meta() {
      if (REAL_MODE) return await realReq('GET', '/hrm/meta');
      return (await transport('GET', '/connector/api/hrm/meta')).data;
    },
    async org() {
      if (REAL_MODE) return await realReq('GET', '/hrm/org');
      return (await transport('GET', '/connector/api/hrm/org')).data;
    },
    async addOrg(kind: any, name: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/org', { body: { kind, name } });
      return (await transport('POST', '/connector/api/hrm/org', { body: { kind, name } })).data;
    },
    async removeOrg(kind: any, name: any) {
      if (REAL_MODE) return await realReq('DELETE', '/hrm/org', { query: { kind, name } });
      return (await transport('DELETE', '/connector/api/hrm/org', { query: { kind, name } })).data;
    },
    async addEmployee(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/employee', { body: {
        name: body.name, email: body.email || undefined,
        department: body.department || undefined, designation: body.designation || undefined,
        location_id: isUuid(body.location_id) ? body.location_id : undefined,
        salary: Number(body.salary || 0), joined: body.joined || undefined,
      }});
      return (await transport('POST', '/connector/api/hrm/employee', { body })).data;
    },
    async removeEmployee(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/hrm/employee/' + id);
      return (await transport('DELETE', '/connector/api/hrm/employee/' + id)).data;
    },
    async settings() {
      if (REAL_MODE) return await realReq('GET', '/hrm/settings');
      return (await transport('GET', '/connector/api/hrm/settings')).data;
    },
    async saveSettings(body: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/settings', { body });
      return (await transport('PUT', '/connector/api/hrm/settings', { body })).data;
    },
    async setEmpShift(id: any, body: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/employee/' + id + '/shift', { body });
      return (await transport('PUT', '/connector/api/hrm/employee/' + id + '/shift', { body })).data;
    },
    // ── Phases 2–5 (attendance, leave, payroll, shifts, advances, todos):
    //    not wired yet — return empty in real mode so the tabs render cleanly. ──
    async attendance() {
      if (REAL_MODE) return await realReq('GET', '/hrm/attendance');
      return (await transport('GET', '/connector/api/hrm/attendance')).data;
    },
    async clock(employee_id: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/attendance/clock', { body: { employee_id, ...hrStamp() } });
      return (await transport('POST', '/connector/api/hrm/attendance/clock', { body: { employee_id } })).data;
    },
    async breakToggle(employee_id: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/attendance/break', { body: { employee_id, ...hrStamp() } });
      return (await transport('POST', '/connector/api/hrm/attendance/break', { body: { employee_id } })).data;
    },
    async autoAbsent() {
      if (REAL_MODE) return await realReq('POST', '/hrm/attendance/auto-absent', { body: { date: hrStamp().date } });
      return (await transport('POST', '/connector/api/hrm/attendance/auto-absent', { body: {} })).data;
    },
    async leaves() {
      if (REAL_MODE) return await realReq('GET', '/hrm/leave');
      return (await transport('GET', '/connector/api/hrm/leave')).data;
    },
    async addLeave(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/leave', { body: { employee_id: body.employee_id, type: body.type, from: body.from || undefined, to: body.to || undefined, days: Number(body.days || 1), reason: body.reason || undefined } });
      return (await transport('POST', '/connector/api/hrm/leave', { body })).data;
    },
    async setLeave(id: any, status: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/leave/' + id, { body: { status } });
      return (await transport('PUT', '/connector/api/hrm/leave/' + id, { body: { status } })).data;
    },
    async leaveBalances() {
      if (REAL_MODE) return await realReq('GET', '/hrm/leave-balance');
      return (await transport('GET', '/connector/api/hrm/leave-balance')).data;
    },
    async empLeaveBalance(id: any) {
      if (REAL_MODE) return await realReq('GET', '/hrm/leave-balance/' + id);
      return (await transport('GET', '/connector/api/hrm/leave-balance/' + id)).data;
    },
    async leaveTypes() {
      if (REAL_MODE) return await realReq('GET', '/hrm/leave-type');
      return (await transport('GET', '/connector/api/hrm/leave-type')).data;
    },
    async addLeaveType(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/leave-type', { body });
      return (await transport('POST', '/connector/api/hrm/leave-type', { body })).data;
    },
    async updateLeaveType(id: any, body: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/leave-type/' + id, { body });
      return (await transport('PUT', '/connector/api/hrm/leave-type/' + id, { body })).data;
    },
    async removeLeaveType(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/hrm/leave-type/' + id);
      return (await transport('DELETE', '/connector/api/hrm/leave-type/' + id)).data;
    },
    async leaveOverride(empId: any) {
      if (REAL_MODE) return await realReq('GET', '/hrm/leave-override/' + empId);
      return (await transport('GET', '/connector/api/hrm/leave-override/' + empId)).data;
    },
    async setLeaveOverride(empId: any, overrides: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/leave-override/' + empId, { body: { overrides } });
      return (await transport('PUT', '/connector/api/hrm/leave-override/' + empId, { body: { overrides } })).data;
    },
    async payroll() {
      if (REAL_MODE) return await realReq('GET', '/hrm/payroll');
      return (await transport('GET', '/connector/api/hrm/payroll')).data;
    },
    async attendanceSummary(month: any) {
      if (REAL_MODE) return await realReq('GET', '/hrm/attendance-summary', { query: { month } });
      return (await transport('GET', '/connector/api/hrm/attendance-summary', { query: { month } })).data;
    },
    async empSummary(id: any, month: any) {
      if (REAL_MODE) return await realReq('GET', '/hrm/attendance-summary/' + id, { query: { month } });
      return (await transport('GET', '/connector/api/hrm/attendance-summary/' + id, { query: { month } })).data;
    },
    async addPayroll(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/payroll', { body: { employee_id: body.employee_id, month: body.month, basic: Number(body.basic || 0), allowance: Number(body.allowance || 0), overtime: Number(body.overtime || 0), bonus: Number(body.bonus || 0), incentive: Number(body.incentive || 0), deduction: Number(body.deduction || 0) } });
      return (await transport('POST', '/connector/api/hrm/payroll', { body })).data;
    },
    async payslip(id: any) {
      if (REAL_MODE) return await realReq('GET', '/hrm/payslip/' + id);
      return (await transport('GET', '/connector/api/hrm/payslip/' + id)).data;
    },
    async payslipSettings() {
      if (REAL_MODE) return await realReq('GET', '/hrm/payslip-settings');
      return (await transport('GET', '/connector/api/hrm/payslip-settings')).data;
    },
    async savePayslipSettings(body: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/payslip-settings', { body });
      return (await transport('PUT', '/connector/api/hrm/payslip-settings', { body })).data;
    },
    async todos() {
      if (REAL_MODE) return await realReq('GET', '/hrm/todo');
      return (await transport('GET', '/connector/api/hrm/todo')).data;
    },
    async addTodo(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/todo', { body: { title: body.title, assigned_to: isUuid(body.assigned_to) ? body.assigned_to : undefined, priority: body.priority || 'medium', due: body.due || undefined } });
      return (await transport('POST', '/connector/api/hrm/todo', { body })).data;
    },
    async setTodo(id: any, status: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/todo/' + id, { body: { status } });
      return (await transport('PUT', '/connector/api/hrm/todo/' + id, { body: { status } })).data;
    },
    async shifts() {
      if (REAL_MODE) return await realReq('GET', '/hrm/shift');
      return (await transport('GET', '/connector/api/hrm/shift')).data;
    },
    async addShift(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/shift', { body: { employee_id: body.employee_id, location_id: isUuid(body.location_id) ? body.location_id : undefined, date: body.date || undefined, start: body.start, end: body.end, role: body.role || undefined } });
      return (await transport('POST', '/connector/api/hrm/shift', { body })).data;
    },
    async removeShift(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/hrm/shift/' + id);
      return (await transport('DELETE', '/connector/api/hrm/shift/' + id)).data;
    },
    async shiftSwaps() {
      if (REAL_MODE) return await realReq('GET', '/hrm/shift-swap');
      return (await transport('GET', '/connector/api/hrm/shift-swap')).data;
    },
    async addSwap(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/shift-swap', { body: { shift_id: body.shift_id, to_id: body.to_id, reason: body.reason || undefined } });
      return (await transport('POST', '/connector/api/hrm/shift-swap', { body })).data;
    },
    async setSwap(id: any, status: any) {
      if (REAL_MODE) return await realReq('PUT', '/hrm/shift-swap/' + id, { body: { status } });
      return (await transport('PUT', '/connector/api/hrm/shift-swap/' + id, { body: { status } })).data;
    },
    async removeSwap(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/hrm/shift-swap/' + id);
      return (await transport('DELETE', '/connector/api/hrm/shift-swap/' + id)).data;
    },
    async advances() {
      if (REAL_MODE) return await realReq('GET', '/hrm/advance');
      return (await transport('GET', '/connector/api/hrm/advance')).data;
    },
    async outstandingAdvance(empId: any) {
      if (REAL_MODE) return (await realReq('GET', '/hrm/advance/outstanding/' + empId)).outstanding;
      return (await transport('GET', '/connector/api/hrm/advance/outstanding/' + empId)).data.outstanding;
    },
    async addAdvance(body: any) {
      if (REAL_MODE) return await realReq('POST', '/hrm/advance', { body: { employee_id: body.employee_id, amount: Number(body.amount || 0), date: body.date || undefined, account_id: isUuid(body.account_id) ? body.account_id : undefined, note: body.note || undefined } });
      return (await transport('POST', '/connector/api/hrm/advance', { body })).data;
    },
    async removeAdvance(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/hrm/advance/' + id);
      return (await transport('DELETE', '/connector/api/hrm/advance/' + id)).data;
    },
  },
  superadmin: {
    async stats() {
      if (REAL_MODE) return await realReq('GET', '/superadmin/stats');
      return (await transport('GET', '/connector/api/superadmin/stats')).data;
    },
    async businesses() {
      if (REAL_MODE) return await realReq('GET', '/superadmin/business');
      return (await transport('GET', '/connector/api/superadmin/business')).data;
    },
    async setBusiness(id: any, body: any) {
      if (REAL_MODE) return await realReq('PUT', '/superadmin/business/' + id, { body });
      return (await transport('PUT', '/connector/api/superadmin/business/' + id, { body })).data;
    },
    async moduleCatalog() {
      if (REAL_MODE) { const r = await realReq('GET', '/superadmin/module-catalog'); return (r && r.modules) || []; }
      return [];
    },
    async setBusinessModules(id: any, enabledModules: any[]) {
      if (REAL_MODE) return await realReq('PUT', '/superadmin/business/' + id + '/modules', { body: { enabled_modules: enabledModules } });
      throw new ApiError(501, 'Module overrides need the live backend.');
    },
    async packages() {
      if (REAL_MODE) return await realReq('GET', '/superadmin/package');
      return (await transport('GET', '/connector/api/superadmin/package')).data;
    },
    async addPackage(body: any) {
      if (REAL_MODE) return await realReq('POST', '/superadmin/package', { body });
      return (await transport('POST', '/connector/api/superadmin/package', { body })).data;
    },
    async removePackage(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/superadmin/package/' + id);
      return (await transport('DELETE', '/connector/api/superadmin/package/' + id)).data;
    },
    async payments() {
      if (REAL_MODE) return await realReq('GET', '/superadmin/payment');
      return (await transport('GET', '/connector/api/superadmin/payment')).data;
    },
    async setPayment(id: any, status: any) {
      if (REAL_MODE) return await realReq('PUT', '/superadmin/payment/' + id, { body: { status } });
      return (await transport('PUT', '/connector/api/superadmin/payment/' + id, { body: { status } })).data;
    },
    async gateways() {
      if (REAL_MODE) return await realReq('GET', '/superadmin/gateway');
      return (await transport('GET', '/connector/api/superadmin/gateway')).data;
    },
    async setGateways(body: any) {
      if (REAL_MODE) return await realReq('PUT', '/superadmin/gateway', { body });
      return (await transport('PUT', '/connector/api/superadmin/gateway', { body })).data;
    },
  },
  purchase: {
    async list() { return (await transport('GET', '/connector/api/purchase')).data; },
    async get(id: any) { return (await transport('GET', '/connector/api/purchase/' + id)).data[0]; },
    async create(body: any) { return (await transport('POST', '/connector/api/purchase', { body })).data; },
  },
  openingStock: {
    async set(body: any) { return (await transport('POST', '/connector/api/opening-stock', { body })).data; },
  },
  reward: {
    async getSettings() {
      if (REAL_MODE) return await realReq('GET', '/loyalty/rules');
      return (await transport('GET', '/connector/api/reward-point-setting')).data;
    },
    async saveSettings(body: any) {
      if (REAL_MODE) return await realReq('PUT', '/loyalty/rules', { body });
      return (await transport('PUT', '/connector/api/reward-point-setting', { body })).data;
    },
    async members() {
      if (REAL_MODE) return await realReq('GET', '/loyalty/members');
      return (await transport('GET', '/connector/api/reward-member')).data;
    },
  },
  coupon: {
    async list() {
      if (REAL_MODE) { const r = await realReq('GET', '/coupons'); return ((r && (r.coupons || r.data)) || []).map(adaptRealCoupon); }
      return [];
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealCoupon(await realReq('POST', '/coupons', { body: toRealCouponBody(body) }));
      throw new ApiError(501, 'Coupons need the live backend.');
    },
    async update(id: any, body: any) {
      if (REAL_MODE) return adaptRealCoupon(await realReq('PUT', '/coupons/' + id, { body: toRealCouponBody(body) }));
      throw new ApiError(501, 'Coupons need the live backend.');
    },
    async validate(code: any, subtotal: any) {
      if (REAL_MODE) return await realReq('POST', '/coupons/validate', { body: { code, subtotal: Number(subtotal || 0) } });
      throw new ApiError(501, 'Coupons need the live backend.');
    },
  },
  report: {
    // Revenue by product category for the Reports overview chart. Null in mock
    // mode so the screen keeps its seed chart.
    async byCategory(params: any = {}) {
      if (REAL_MODE) { const r = await realReq('GET', '/reports/sales-by-category', { query: params }); return (r && r.categories) || []; }
      return null;
    },
    // Live KPIs from the backend; null in mock mode so screens keep their seed data.
    async dashboard() {
      if (REAL_MODE) return adaptRealDashboard(await realReq('GET', '/reports/dashboard'));
      return null;
    },
    async profit(range: any = {}) {
      if (REAL_MODE) return await realReq('GET', '/reports/profit', { query: range });
      return null;
    },
    async salesSummary(range: any = {}) {
      if (REAL_MODE) return await realReq('GET', '/reports/sales', { query: range });
      return null;
    },
    async commissionSettings() {
      if (REAL_MODE) return await realReq('GET', '/reports/commission/settings');
      return (await transport('GET', '/connector/api/commission-setting')).data;
    },
    async saveCommissionSettings(body: any) {
      if (REAL_MODE) return await realReq('PUT', '/reports/commission/settings', { body });
      return (await transport('PUT', '/connector/api/commission-setting', { body })).data;
    },
    async salesReps(calc: any) {
      if (REAL_MODE) return await realReq('GET', '/reports/commission/reps', { query: { calc } });
      return (await transport('GET', '/connector/api/sales-representative', { query: { calc } })).data;
    },
    async salesRep(id: any, calc: any) {
      if (REAL_MODE) return await realReq('GET', '/reports/commission/reps/' + id, { query: { calc } });
      return (await transport('GET', '/connector/api/sales-representative/' + id, { query: { calc } })).data;
    },
    async registers() {
      if (REAL_MODE) return await realReq('GET', '/reports/registers');
      return (await transport('GET', '/connector/api/cash-register-report')).data;
    },
  },
  register: {
    async current() {
      if (REAL_MODE) return realRegister(await realReq('GET', '/sales/shifts/current'));
      return (await transport('GET', '/connector/api/cash-register')).data;
    },
    async open(body: any) {
      if (REAL_MODE) {
        await realReq('POST', '/sales/shifts/open', { body: {
          location_id: isUuid(body.location_id) ? body.location_id : undefined,
          opening_float: Number(body.opening_cash || 0),
        }});
        // Re-fetch current so the returned record carries the location name (include).
        return realRegister(await realReq('GET', '/sales/shifts/current'));
      }
      return (await transport('POST', '/connector/api/cash-register', { body })).data;
    },
    async shifts() {
      // Employee-shift assignment is an HRM concept not wired to the POS backend
      // yet — return none in real mode so the optional picker stays hidden.
      if (REAL_MODE) return [];
      return (await transport('GET', '/connector/api/cash-register/shifts')).data;
    },
    async close(id: any, body: any) {
      if (REAL_MODE) return realRegister(await realReq('POST', '/sales/shifts/' + id + '/close', { body: {
        actual_cash: Number(body.total_cash || 0),
        notes: body.note || undefined,
      }}));
      return (await transport('POST', '/connector/api/cash-register/' + id + '/close', { body })).data;
    },
  },
  heldSale: {
    async list(type: any) {
      if (REAL_MODE) {
        const res = await realReq('GET', '/sales/held');
        return (res.held_sales || res.data || []).map((h: any) => {
          // The backend HoldSale has no type/customer_id columns — we pack them
          // into label as "type|customer_id" on save and unpack them here.
          const [kind, cid] = String(h.label || 'suspended').split('|');
          const cart = Array.isArray(h.items) ? h.items : [];
          return {
            id: h.id, type: kind || 'suspended', customer_id: cid || null,
            customer_name: h.customerName || 'Walk-in',
            ref: 'HELD-' + String(h.id).replace(/-/g, '').slice(0, 4).toUpperCase(),
            item_count: cart.reduce((n: number, i: any) => n + Number(i.qty || i.quantity || 1), 0),
            cart, total: Number(h.subtotal || 0),
            created_at: h.createdAt ? String(h.createdAt).slice(0, 10) : '',
          };
        });
      }
      return (await transport('GET', '/connector/api/held-sale', { query: { type } })).data;
    },
    async save(body: any) {
      if (REAL_MODE) {
        const cart = (body.cart && body.cart.length) ? body.cart : (body.items || []);
        return await realReq('POST', '/sales/held', { body: {
          label: `${body.type || 'suspended'}|${isUuid(body.customer_id) ? body.customer_id : ''}`,
          customer_name: body.customer_name || 'Walk-in',
          items: cart.length ? cart : [{ note: 'empty' }],   // backend requires a non-empty array
          subtotal: Number(body.total || 0),
          shift_id: isUuid(body.shift_id) ? body.shift_id : undefined,
        }});
      }
      return (await transport('POST', '/connector/api/held-sale', { body })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/sales/held/' + id);
      return (await transport('DELETE', '/connector/api/held-sale/' + id)).data;
    },
  },
  transfer: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/stock/transfers');
        return (Array.isArray(res) ? res : (res.transfers || res.data || [])).map(adaptRealTransfer);
      }
      return (await transport('GET', '/connector/api/stock-transfer')).data;
    },
    async get(id: any) {
      if (REAL_MODE) return adaptRealTransfer(await realReq('GET', '/stock/transfers/' + id));
      return (await transport('GET', '/connector/api/stock-transfer/' + id)).data[0];
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealTransfer(await realReq('POST', '/stock/transfers', { body: toRealTransferBody(body) }));
      return (await transport('POST', '/connector/api/stock-transfer', { body })).data;
    },
    async setStatus(id: any, status: any) {
      // The backend moves stock the moment a transfer is created (status 'received')
      // and exposes no status-transition endpoint — treat as a no-op in real mode.
      if (REAL_MODE) return { id, status };
      return (await transport('PUT', '/connector/api/stock-transfer/' + id + '/status', { body: { status } })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/stock/transfers/' + id);
      return (await transport('DELETE', '/connector/api/stock-transfer/' + id)).data;
    },
  },
  purchaseOrder: {
    async list() {
      if (REAL_MODE) {
        const res = await realReq('GET', '/purchase-orders');
        return ((res && (res.orders || res.data)) || []).map(adaptRealPO);
      }
      return (await transport('GET', '/connector/api/purchase-order')).data;
    },
    async get(id: any) {
      if (REAL_MODE) return adaptRealPO(await realReq('GET', '/purchase-orders/' + id));
      return (await transport('GET', '/connector/api/purchase-order/' + id)).data[0];
    },
    async create(body: any) {
      if (REAL_MODE) return adaptRealPO(await realReq('POST', '/purchase-orders', { body: toRealPOBody(body) }));
      return (await transport('POST', '/connector/api/purchase-order', { body })).data;
    },
    // Receiving (status 'received'/'partial') needs a received_items payload the
    // orders screen doesn't send yet; simple transitions (approve/send/cancel) work.
    async setStatus(id: any, status: any) {
      if (REAL_MODE) return adaptRealPO(await realReq('PUT', '/purchase-orders/' + id + '/status', { body: { status } }));
      return (await transport('PUT', '/connector/api/purchase-order/' + id + '/status', { body: { status } })).data;
    },
    async remove(id: any) {
      if (REAL_MODE) return await realReq('DELETE', '/purchase-orders/' + id);
      return (await transport('DELETE', '/connector/api/purchase-order/' + id)).data;
    },
  },
  salesOrder: {
    async list() { return (await transport('GET', '/connector/api/sales-order')).data; },
    async get(id: any) { return (await transport('GET', '/connector/api/sales-order/' + id)).data[0]; },
    async create(body: any) { return (await transport('POST', '/connector/api/sales-order', { body })).data; },
    async setStatus(id: any, status: any) { return (await transport('PUT', '/connector/api/sales-order/' + id + '/status', { body: { status } })).data; },
    async remove(id: any) { return (await transport('DELETE', '/connector/api/sales-order/' + id)).data; },
  },
  // GET /connector/api/business-location
  businessLocation: { async list() { return (await transport('GET', '/connector/api/business-location')).data; } },

  // Business registration & reference data
  business: {
    async currencies() { return (await transport('GET', '/business/currencies', { auth: false })).data; },
    async timezones() { return (await transport('GET', '/business/timezones', { auth: false })).data; },
    // Live business profile (/api/v1/settings → the Business record). Null in mock.
    async get() { if (REAL_MODE) { try { return await realReq('GET', '/settings'); } catch (e) { return null; } } return null; },
    async update(body: any) { if (REAL_MODE) return await realReq('PUT', '/settings', { body }); throw new ApiError(501, 'Editing the business profile needs the live backend.'); },
    async register(payload: any) {
      if (REAL_MODE) {
        // The wizard sends { business, tax, user }; the backend expects a flat
        // { businessName, email, password, phone?, country? } at /auth/register.
        const { business = {}, user = {} } = payload || {};
        const res = await realReq('POST', '/auth/register', { auth: false, body: {
          businessName: business.name,
          email: user.email,
          password: user.password,
          phone: user.phone || undefined,
          country: business.country || undefined,
        }});
        setTokens(res.access_token, res.refresh_token);
        const u = res.user || {};
        return { message: 'Business registered successfully.', username: u.email || user.username || user.email, role: u.role || 'owner' };
      }
      return (await transport('POST', '/business/register', { auth: false, body: payload })).data;
    },
  },
};

// Replay persisted ledger onto globals at boot (mock mode only, browser only).
if (typeof window !== 'undefined' && API_CONFIG.mode === 'mock') { try { replayLedger(); } catch (e) { console.warn('ledger replay', e); } }

export { API, transport, ApiError, API_CONFIG, moduleOn, adaptProduct };
export default API;
