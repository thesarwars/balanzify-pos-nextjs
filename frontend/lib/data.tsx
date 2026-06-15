'use client';

import React from 'react';
import { money, money0 } from '@/lib/theme';
import { Badge } from '@/components/kit';

// Deterministic PRNG so module-scope mock data is identical on the server and the
// client — using Math.random() here causes React hydration mismatches in Next.js.
let _seed = 0x2f6e2b1;
function _rand() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }

// ─────────────────────────────────────────────────────────────────
// Mock data — believable East-African multi-vertical POS shop.
// Business: "Hodan Mini Market" (retail + a little pharmacy).
// ─────────────────────────────────────────────────────────────────

export const BUSINESS = { name: 'Hodan Mini Market', branch: 'Maka Al Mukarama Rd', currency: '$' };
export const CASHIER = { name: 'Amina Yusuf', role: 'Cashier', initials: 'AY' };

export const CATEGORIES: any[] = [
  { id: 'all',     name: 'All Items',   icon: '▦', count: 0 },
  { id: 'drinks',  name: 'Drinks',      icon: '◉', count: 0, color: '#7FB7D6', desc: 'Teas, water, soft & energy drinks.' },
  { id: 'grocery', name: 'Grocery',     icon: '◫', count: 0, color: '#D9A441', desc: 'Staples — rice, oil, flour, sugar, pasta.' },
  { id: 'bakery',  name: 'Bakery',      icon: '◓', count: 0, color: '#C58A4A', desc: 'Fresh bread, sambusa, anjero, cookies.' },
  { id: 'dairy',   name: 'Dairy',       icon: '◐', count: 0, color: '#5B8A4C', desc: 'Milk, yogurt, butter and cheese.' },
  { id: 'home',    name: 'Home Care',   icon: '☖', count: 0, color: '#6E9FC9', desc: 'Soap, detergent, tissue and cleaning.' },
  { id: 'pharmacy',name: 'Pharmacy',    icon: '✚', count: 0, color: '#C0504D', desc: 'Over-the-counter and prescription items.' },
  { id: 'snacks',  name: 'Snacks',      icon: '◆', count: 0, color: '#B5793F', desc: 'Chips, biscuits, peanuts and chocolate.' },
];

// swatch = soft tile color so the grid reads without photography
export const PRODUCTS: any[] = [
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

export const PAYMENT_METHODS: any[] = [
  { id: 'cash', label: 'Cash',     icon: '◎', hint: 'Notes & coins' },
  { id: 'zaad', label: 'Zaad',     icon: '◈', hint: 'Mobile money' },
  { id: 'evc',  label: 'EVC Plus', icon: '◆', hint: 'Mobile money' },
  { id: 'card', label: 'Card',     icon: '▭', hint: 'Visa / Master' },
];

// Recent sales for Dashboard + Sales screen
const NAMES = ['Walk-in', 'Khadija Ali', 'Mohamed Farah', 'Walk-in', 'Ifrah Abdi', 'Walk-in', 'Yusuf Omar', 'Hodan Said', 'Walk-in', 'Abdirahman N.', 'Walk-in', 'Sahra Jama'];
export const SALES: any[] = Array.from({ length: 12 }).map((_, i) => {
  const pm = PAYMENT_METHODS[i % PAYMENT_METHODS.length];
  const total = +(2 + _rand() * 46).toFixed(2);
  const items = 1 + Math.floor(_rand() * 7);
  return {
    id: 'SL-' + String(1042 - i).padStart(5, '0'),
    customer: NAMES[i],
    cashier: i % 3 === 0 ? 'Amina Y.' : i % 3 === 1 ? 'Bashir M.' : 'Nimco H.',
    method: pm.id, methodLabel: pm.label,
    items, total,
    minsAgo: Math.round(i * 7.5 + _rand() * 5),
    status: i === 4 ? 'refunded' : i === 9 ? 'held' : 'completed',
  };
});

export const DASH = {
  salesToday: 1284.50, txToday: 96, salesTrend: 12.4,
  salesMonth: 28940.00, monthTrend: 8.1,
  stockValue: 19420.00, products: PRODUCTS.length,
  avgBasket: 13.38, basketTrend: 3.2,
  lowStock: PRODUCTS.filter((p: any) => p.stock <= 12).length,
  byPayment: [
    { id: 'cash', label: 'Cash',     value: 540.00, color: '#0E9F6E' },
    { id: 'zaad', label: 'Zaad',     value: 392.50, color: '#1B3A6B' },
    { id: 'evc',  label: 'EVC Plus', value: 248.00, color: '#7C3AED' },
    { id: 'card', label: 'Card',     value: 104.00, color: '#A16207' },
  ],
  // 14 hourly buckets for a sparkline-ish bar chart (store open 8am–9pm)
  hourly: [18, 34, 52, 78, 96, 110, 88, 64, 72, 120, 138, 102, 70, 44],
  topProducts: [
    { name: 'Somali Tea (Shaah)', qty: 142, revenue: 213.00 },
    { name: 'Bottled Water 1.5L', qty: 98, revenue: 73.50 },
    { name: 'Fresh Sambusa', qty: 86, revenue: 43.00 },
    { name: 'Basmati Rice 5kg', qty: 14, revenue: 124.60 },
    { name: 'Cola 500ml', qty: 61, revenue: 73.20 },
  ],
};

// ─────────────────────────────────────────────────────────────────
// Extra mock data + config for the breadth of repo screens.
// A generic DataScreen consumes DATA[id] = { title, subtitle, stats, cols, rows, search, filters }.
// cols: { key, label, align?, mono?, render?(row,T) }
// ─────────────────────────────────────────────────────────────────

// ── helpers to make believable rows ──────────────────────────────
const _phone = () => '+252 6' + (10 + Math.floor(_rand() * 80)) + ' ' + (100 + Math.floor(_rand() * 899)) + ' ' + (1000 + Math.floor(_rand() * 8999));

export const CUSTOMERS: any[] = [
  { name: 'Khadija Ali', phone: '+252 61 552 1190', tier: 'Gold', credit: 0, spent: 1840.50, visits: 64, last: 'Today' },
  { name: 'Mohamed Farah', phone: '+252 63 412 8830', tier: 'Silver', credit: 42.00, spent: 980.20, visits: 31, last: 'Yesterday' },
  { name: 'Ifrah Abdi', phone: '+252 61 770 4521', tier: 'Gold', credit: 0, spent: 2210.75, visits: 88, last: 'Today' },
  { name: 'Yusuf Omar', phone: '+252 90 221 7788', tier: 'Bronze', credit: 18.50, spent: 410.00, visits: 12, last: '3d ago' },
  { name: 'Hodan Said', phone: '+252 61 339 1020', tier: 'Silver', credit: 0, spent: 765.40, visits: 27, last: '1w ago' },
  { name: 'Abdirahman N.', phone: '+252 62 884 5610', tier: 'Gold', credit: 120.00, spent: 3050.10, visits: 102, last: 'Today' },
  { name: 'Sahra Jama', phone: '+252 61 220 9934', tier: 'Bronze', credit: 0, spent: 220.30, visits: 8, last: '2w ago' },
  { name: 'Cabdi Warsame', phone: '+252 90 551 3321', tier: 'Silver', credit: 65.00, spent: 1120.00, visits: 44, last: '4d ago' },
];

export const SUPPLIERS: any[] = [
  { name: 'Juba Foods Ltd', contact: 'Aweis K.', cat: 'Grocery', outstanding: 1240.00, last: '12 Jun', status: 'active' },
  { name: 'Banadir Beverages', contact: 'Sucaad M.', cat: 'Drinks', outstanding: 0, last: '09 Jun', status: 'active' },
  { name: 'Horn Pharma Dist.', contact: 'Dr. Nuur', cat: 'Pharmacy', outstanding: 880.50, last: '05 Jun', status: 'active' },
  { name: 'Shabelle Dairy Co.', contact: 'Faadumo A.', cat: 'Dairy', outstanding: 320.00, last: '11 Jun', status: 'active' },
  { name: 'Hargeisa Home Care', contact: 'Cali D.', cat: 'Home Care', outstanding: 0, last: '28 May', status: 'paused' },
  { name: 'Berbera Bakers', contact: 'Idiris H.', cat: 'Bakery', outstanding: 145.00, last: '12 Jun', status: 'active' },
];

export const PURCHASE_ORDERS: any[] = [
  { id: 'PO-00231', supplier: 'Juba Foods Ltd', items: 14, total: 1820.00, expected: '15 Jun', status: 'pending' },
  { id: 'PO-00230', supplier: 'Banadir Beverages', items: 6, total: 540.00, expected: '13 Jun', status: 'confirmed' },
  { id: 'PO-00229', supplier: 'Horn Pharma Dist.', items: 22, total: 2110.50, expected: '14 Jun', status: 'pending' },
  { id: 'PO-00228', supplier: 'Shabelle Dairy Co.', items: 9, total: 480.00, expected: '12 Jun', status: 'received' },
  { id: 'PO-00227', supplier: 'Berbera Bakers', items: 5, total: 210.00, expected: '11 Jun', status: 'received' },
  { id: 'PO-00226', supplier: 'Juba Foods Ltd', items: 18, total: 1640.00, expected: '10 Jun', status: 'received' },
];

export const STOCK_ROWS: any[] = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).slice(0, 14).map((p: any) => ({
  name: p.name, sw: p.sw, location: ['Main Store', 'Back Store', 'Counter'][Math.floor(_rand() * 3)],
  onhand: p.stock, reserved: Math.floor(_rand() * 4), reorder: 12, unit: p.unit,
  status: p.stock <= 12 ? 'low' : p.stock > 100 ? 'high' : 'ok',
}));

export const STOCKTAKE: any[] = [
  { id: 'ST-0042', location: 'Main Store', items: 128, variance: -3, status: 'review', date: 'Today 09:12' },
  { id: 'ST-0041', location: 'Counter', items: 36, variance: 0, status: 'balanced', date: '11 Jun' },
  { id: 'ST-0040', location: 'Back Store', items: 94, variance: -7, status: 'adjusted', date: '08 Jun' },
  { id: 'ST-0039', location: 'Main Store', items: 130, variance: +2, status: 'adjusted', date: '01 Jun' },
];

export const COUPONS: any[] = [
  { code: 'RAMADAN10', type: 'Percent', value: '10%', used: 142, limit: 500, expires: '30 Jun', status: 'active' },
  { code: 'WELCOME5', type: 'Fixed', value: '$5.00', used: 88, limit: 200, expires: '31 Dec', status: 'active' },
  { code: 'BULK15', type: 'Percent', value: '15%', used: 26, limit: 100, expires: '20 Jun', status: 'active' },
  { code: 'EID2025', type: 'Percent', value: '12%', used: 310, limit: 310, expires: '08 Jun', status: 'expired' },
  { code: 'STAFF20', type: 'Percent', value: '20%', used: 54, limit: 0, expires: '—', status: 'active' },
];

export const LOYALTY: any[] = CUSTOMERS.map((c: any, i: number) => ({
  name: c.name, tier: c.tier, points: Math.round(c.spent * 2.4), lifetime: c.spent, joined: ['Jan', 'Feb', 'Mar', 'Apr'][i % 4] + ' 2024',
}));

export const PETTY_CASH: any[] = [
  { date: 'Today 14:20', desc: 'Delivery fuel', cat: 'Transport', out: 12.00, in: 0, bal: 268.00 },
  { date: 'Today 11:05', desc: 'Float top-up', cat: 'Cash', out: 0, in: 100.00, bal: 280.00 },
  { date: 'Today 09:40', desc: 'Cleaning supplies', cat: 'Supplies', out: 8.50, in: 0, bal: 180.00 },
  { date: 'Yesterday', desc: 'Tea for staff', cat: 'Welfare', out: 6.00, in: 0, bal: 188.50 },
  { date: '11 Jun', desc: 'Receipt rolls', cat: 'Supplies', out: 14.00, in: 0, bal: 194.50 },
];

export const ADJUSTMENTS: any[] = [
  { id: 'ADJ-118', product: 'Fresh Milk 1L', reason: 'Damage', qty: -4, by: 'Bashir M.', date: 'Today' },
  { id: 'ADJ-117', product: 'White Bread Loaf', reason: 'Expiry', qty: -6, by: 'Amina Y.', date: 'Today' },
  { id: 'ADJ-116', product: 'Cooking Oil 3L', reason: 'Count fix', qty: +2, by: 'Nimco H.', date: 'Yesterday' },
  { id: 'ADJ-115', product: 'Yogurt Cup', reason: 'Damage', qty: -3, by: 'Bashir M.', date: '11 Jun' },
];

export const TRANSFERS: any[] = [
  { id: 'TR-0071', from: 'Main Store', to: 'Counter', items: 12, status: 'in transit', date: 'Today' },
  { id: 'TR-0070', from: 'Back Store', to: 'Main Store', items: 30, status: 'received', date: 'Yesterday' },
  { id: 'TR-0069', from: 'Main Store', to: 'Branch 2', items: 18, status: 'received', date: '10 Jun' },
  { id: 'TR-0068', from: 'Counter', to: 'Back Store', items: 4, status: 'cancelled', date: '09 Jun' },
];

export const LOCATIONS: any[] = [
  { name: 'Main Store', type: 'Retail', manager: 'Amina Yusuf', sales: 842.50, stock: 11200.00, status: 'open', address: 'Maka Al Mukarama Rd, Mogadishu' },
  { name: 'Counter', type: 'Kiosk', manager: 'Bashir M.', sales: 312.00, stock: 2100.00, status: 'open', address: 'Front entrance — Main Store' },
  { name: 'Back Store', type: 'Warehouse', manager: 'Nimco H.', sales: 0, stock: 6120.00, status: 'open', address: 'Warehouse Block C, Industrial Rd' },
  { name: 'Branch 2 — Hodan', type: 'Retail', manager: 'Cali D.', sales: 130.00, stock: 4300.00, status: 'closed', address: 'Hodan District, Wadajir St' },
];

export const USERS: any[] = [
  { name: 'Amina Yusuf', role: 'Cashier', email: 'amina@hodanmarket.so', last: 'Online now', status: 'active' },
  { name: 'Bashir Maxamed', role: 'Manager', email: 'bashir@hodanmarket.so', last: '20m ago', status: 'active' },
  { name: 'Nimco Hassan', role: 'Stock Keeper', email: 'nimco@hodanmarket.so', last: '2h ago', status: 'active' },
  { name: 'Cali Daahir', role: 'Cashier', email: 'cali@hodanmarket.so', last: 'Yesterday', status: 'active' },
  { name: 'Owner', role: 'Owner', email: 'owner@hodanmarket.so', last: '1h ago', status: 'active' },
  { name: 'Old Account', role: 'Cashier', email: 'temp@hodanmarket.so', last: '3w ago', status: 'disabled' },
];

export const PROJECTS: any[] = [
  { name: 'New Branch Fit-out', client: 'Internal', budget: 12000, progress: 64, due: '30 Jun', status: 'active' },
  { name: 'Cold Storage Install', client: 'Internal', budget: 5400, progress: 30, due: '12 Jul', status: 'active' },
  { name: 'Ramadan Campaign', client: 'Marketing', budget: 1800, progress: 100, due: '08 Jun', status: 'completed' },
  { name: 'POS Hardware Refresh', client: 'IT', budget: 3200, progress: 12, due: '01 Aug', status: 'active' },
];

export const TASKS: any[] = [
  { task: 'Reconcile yesterday till', assignee: 'Amina Y.', priority: 'High', due: 'Today', status: 'open' },
  { task: 'Receive PO-00231', assignee: 'Nimco H.', priority: 'High', due: 'Today', status: 'open' },
  { task: 'Call Horn Pharma re: invoice', assignee: 'Bashir M.', priority: 'Medium', due: 'Tomorrow', status: 'open' },
  { task: 'Update Ramadan shelf', assignee: 'Cali D.', priority: 'Low', due: '14 Jun', status: 'done' },
  { task: 'Stocktake back store', assignee: 'Nimco H.', priority: 'Medium', due: '15 Jun', status: 'open' },
];

// money render helper using money
const M = (k: string) => (r: any, T: any) => <span style={{ fontFamily: T.fMono, fontWeight: 600 }}>{money(r[k])}</span>;

export const DATA: Record<string, any> = {
  locations: {
    title: 'Locations', subtitle: `${LOCATIONS.length} locations`, add: '+ Add Location',
    stats: [['Locations', LOCATIONS.length], ['Open now', LOCATIONS.filter((l: any) => l.status === 'open').length], ['Total stock value', money0(LOCATIONS.reduce((s: number, l: any) => s + l.stock, 0))]],
    form: [
      { key: 'name', label: 'Location name', type: 'text', required: true, full: true, placeholder: 'e.g. Main Store' },
      { key: 'type', label: 'Location type', type: 'select', full: true, options: ['Retail', 'Kiosk', 'Warehouse', 'Headquarters', 'Virtual'] },
      { key: 'manager', label: 'Manager', type: 'text', full: true, placeholder: 'Who runs this location' },
      { key: 'address', label: 'Physical address / description', type: 'textarea', full: true, placeholder: 'Street, district, city…' },
      { key: 'status', label: 'Operational', type: 'toggle', full: true, on: 'open', off: 'closed', hint: 'Open for business' },
    ],
    cols: [
      { key: 'name', label: 'Location', render: (r: any, T: any) => <b style={{ color: T.ink }}>{r.name}</b> },
      { key: 'type', label: 'Type', render: (r: any, T: any) => <Badge T={T} tone="gray">{r.type}</Badge> },
      { key: 'manager', label: 'Manager' },
      { key: 'sales', label: "Today's sales", align: 'r', render: M('sales') },
      { key: 'stock', label: 'Stock value', align: 'r', render: M('stock') },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'open' ? 'green' : 'gray'}>{r.status}</Badge> },
    ], rows: LOCATIONS,
  },
  categories: {
    title: 'Categories', subtitle: `${CATEGORIES.length - 1} categories`, add: '+ Add Category',
    stats: [['Categories', CATEGORIES.length - 1], ['Total items', (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).length], ['Top category', 'Grocery']],
    form: [
      { key: 'name', label: 'Category name', type: 'text', required: true, full: true, placeholder: 'e.g. Beverages' },
      { key: 'desc', label: 'Description', type: 'textarea', full: true, placeholder: 'What belongs in this category…' },
      { key: 'color', label: 'Theme colour', type: 'color', full: true, presets: ['#7FB7D6', '#D9A441', '#C58A4A', '#5B8A4C', '#6E9FC9', '#C0504D', '#B5793F', '#8A5A2B'] },
    ],
    cols: [
      { key: 'name', label: 'Category', render: (r: any, T: any) => <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 11, height: 11, borderRadius: 99, flexShrink: 0, background: r.color || T.lineMid, boxShadow: `0 0 0 3px ${(r.color || '#999')}22` }} /><span style={{ fontSize: 15, color: T.accent.base }}>{r.icon}</span><b style={{ color: T.ink }}>{r.name}</b></span> },
      { key: 'desc', label: 'Description', render: (r: any, T: any) => <span style={{ color: T.inkSub, fontSize: 12.5 }}>{r.desc || <span style={{ color: T.inkMute }}>—</span>}</span> },
      { key: 'count', label: 'Items', align: 'r', mono: true },
      { key: 'share', label: 'Sales share', align: 'r', render: (r: any, T: any) => { const pct = Math.round((r.count / PRODUCTS.length) * 100); return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', width: 140 }}><span style={{ flex: 1, height: 6, background: T.paperSink, borderRadius: 99 }}><span style={{ display: 'block', height: '100%', width: pct + '%', background: r.color || T.accent.base, borderRadius: 99 }} /></span><span style={{ fontFamily: T.fMono, fontSize: 12, color: T.inkSub, width: 32 }}>{pct}%</span></span>; } },
    ], rows: CATEGORIES.filter((c: any) => c.id !== 'all'),
  },
  stock: {
    title: 'Stock', subtitle: `${STOCK_ROWS.length} tracked items`, add: '+ Adjust Stock',
    stats: [['Items tracked', (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).length], ['Low stock', (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).filter((p: any) => p.stock <= 12).length], ['Stock value', money0(DASH.stockValue)]],
    cols: [
      { key: 'name', label: 'Product', render: (r: any, T: any) => <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${r.sw}, ${r.sw}cc)` }} /><b style={{ color: T.ink }}>{r.name}</b></span> },
      { key: 'location', label: 'Location' },
      { key: 'onhand', label: 'On hand', align: 'r', mono: true },
      { key: 'reserved', label: 'Reserved', align: 'r', mono: true },
      { key: 'reorder', label: 'Reorder pt', align: 'r', mono: true },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'low' ? 'amber' : r.status === 'high' ? 'blue' : 'green'}>{r.status === 'low' ? 'Low' : r.status === 'high' ? 'Overstocked' : 'Healthy'}</Badge> },
    ], rows: STOCK_ROWS,
  },
  stocktake: {
    title: 'Stocktake', subtitle: 'Inventory counts', add: '+ New Count',
    stats: [['Counts this month', STOCKTAKE.length], ['Needs review', STOCKTAKE.filter((s: any) => s.status === 'review').length], ['Net variance', '−8 units']],
    cols: [
      { key: 'id', label: 'Count #', mono: true, render: (r: any, T: any) => <b style={{ color: T.accent.text, fontFamily: T.fMono }}>{r.id}</b> },
      { key: 'location', label: 'Location' },
      { key: 'items', label: 'Items', align: 'r', mono: true },
      { key: 'variance', label: 'Variance', align: 'r', render: (r: any, T: any) => <span style={{ fontFamily: T.fMono, fontWeight: 600, color: r.variance < 0 ? T.red : r.variance > 0 ? T.green : T.inkSub }}>{r.variance > 0 ? '+' : ''}{r.variance}</span> },
      { key: 'status', label: 'Status', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'review' ? 'amber' : r.status === 'balanced' ? 'green' : 'blue'}>{r.status}</Badge> },
      { key: 'date', label: 'Date', align: 'r' },
    ], rows: STOCKTAKE,
  },
  'purchase-orders': {
    title: 'Purchase Orders', subtitle: `${PURCHASE_ORDERS.length} orders`, add: '+ New PO',
    stats: [['Open POs', PURCHASE_ORDERS.filter((p: any) => p.status !== 'received').length], ['Awaiting delivery', PURCHASE_ORDERS.filter((p: any) => p.status === 'confirmed').length], ['Committed spend', money0(PURCHASE_ORDERS.filter((p: any) => p.status !== 'received').reduce((s: number, p: any) => s + p.total, 0))]],
    cols: [
      { key: 'id', label: 'PO #', render: (r: any, T: any) => <b style={{ color: T.accent.text, fontFamily: T.fMono }}>{r.id}</b> },
      { key: 'supplier', label: 'Supplier' },
      { key: 'items', label: 'Items', align: 'r', mono: true },
      { key: 'total', label: 'Total', align: 'r', render: M('total') },
      { key: 'expected', label: 'Expected', align: 'r' },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'received' ? 'green' : r.status === 'confirmed' ? 'blue' : 'amber'}>{r.status}</Badge> },
    ], rows: PURCHASE_ORDERS,
  },
  suppliers: {
    title: 'Suppliers', subtitle: `${SUPPLIERS.length} suppliers`, add: '+ Add Supplier',
    stats: [['Suppliers', SUPPLIERS.length], ['Active', SUPPLIERS.filter((s: any) => s.status === 'active').length], ['Outstanding', money0(SUPPLIERS.reduce((s: number, x: any) => s + x.outstanding, 0))]],
    cols: [
      { key: 'name', label: 'Supplier', render: (r: any, T: any) => <b style={{ color: T.ink }}>{r.name}</b> },
      { key: 'contact', label: 'Contact' },
      { key: 'cat', label: 'Category', render: (r: any, T: any) => <Badge T={T} tone="gray">{r.cat}</Badge> },
      { key: 'outstanding', label: 'Outstanding', align: 'r', render: (r: any, T: any) => <span style={{ fontFamily: T.fMono, fontWeight: 600, color: r.outstanding > 0 ? T.amberText : T.inkSub }}>{money(r.outstanding)}</span> },
      { key: 'last', label: 'Last order', align: 'r' },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'active' ? 'green' : 'gray'}>{r.status}</Badge> },
    ], rows: SUPPLIERS,
  },
  customers: {
    title: 'Customers', subtitle: `${CUSTOMERS.length} of 348 shown`, add: '+ Add Customer',
    stats: [['Total customers', 348], ['With store credit', CUSTOMERS.filter((c: any) => c.credit > 0).length], ['Loyalty members', 210]],
    cols: [
      { key: 'name', label: 'Customer', render: (r: any, T: any) => <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 28, height: 28, borderRadius: 99, background: T.accent.soft, color: T.accent.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{r.name.split(' ').map((n: any) => n[0]).join('').slice(0, 2)}</span><b style={{ color: T.ink }}>{r.name}</b></span> },
      { key: 'phone', label: 'Phone', mono: true },
      { key: 'tier', label: 'Tier', render: (r: any, T: any) => <Badge T={T} tone={r.tier === 'Gold' ? 'amber' : r.tier === 'Silver' ? 'gray' : 'brass'}>{r.tier}</Badge> },
      { key: 'credit', label: 'Credit', align: 'r', render: (r: any, T: any) => <span style={{ fontFamily: T.fMono, color: r.credit > 0 ? T.amberText : T.inkMute }}>{money(r.credit)}</span> },
      { key: 'spent', label: 'Total spent', align: 'r', render: M('spent') },
      { key: 'last', label: 'Last visit', align: 'r' },
    ], rows: CUSTOMERS,
  },
  loyalty: {
    title: 'Loyalty', subtitle: '210 members', add: '+ Enroll Member',
    stats: [['Members', 210], ['Points issued', '184,200'], ['Rewards redeemed', 96]],
    cols: [
      { key: 'name', label: 'Member', render: (r: any, T: any) => <b style={{ color: T.ink }}>{r.name}</b> },
      { key: 'tier', label: 'Tier', render: (r: any, T: any) => <Badge T={T} tone={r.tier === 'Gold' ? 'amber' : r.tier === 'Silver' ? 'gray' : 'brass'}>{r.tier}</Badge> },
      { key: 'points', label: 'Points', align: 'r', mono: true },
      { key: 'lifetime', label: 'Lifetime spend', align: 'r', render: M('lifetime') },
      { key: 'joined', label: 'Joined', align: 'r' },
    ], rows: LOYALTY,
  },
  coupons: {
    title: 'Coupons', subtitle: `${COUPONS.length} campaigns`, add: '+ New Coupon',
    stats: [['Active', COUPONS.filter((c: any) => c.status === 'active').length], ['Redemptions', COUPONS.reduce((s: number, c: any) => s + c.used, 0)], ['Expired', COUPONS.filter((c: any) => c.status === 'expired').length]],
    cols: [
      { key: 'code', label: 'Code', render: (r: any, T: any) => <b style={{ fontFamily: T.fMono, color: T.accent.text }}>{r.code}</b> },
      { key: 'type', label: 'Type', render: (r: any, T: any) => <Badge T={T} tone="gray">{r.type}</Badge> },
      { key: 'value', label: 'Value', align: 'r', mono: true },
      { key: 'used', label: 'Used / Limit', align: 'r', render: (r: any, T: any) => <span style={{ fontFamily: T.fMono, color: T.inkSub }}>{r.used}{r.limit ? ` / ${r.limit}` : ' / ∞'}</span> },
      { key: 'expires', label: 'Expires', align: 'r' },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'active' ? 'green' : 'gray'}>{r.status}</Badge> },
    ], rows: COUPONS,
  },
  'petty-cash': {
    title: 'Petty Cash', subtitle: 'Drawer movements', add: '+ Record Entry',
    stats: [['Current balance', money(268)], ['Out today', money(20.50)], ['In today', money(100)]],
    cols: [
      { key: 'date', label: 'When' },
      { key: 'desc', label: 'Description', render: (r: any, T: any) => <b style={{ color: T.ink, fontWeight: 500 }}>{r.desc}</b> },
      { key: 'cat', label: 'Category', render: (r: any, T: any) => <Badge T={T} tone="gray">{r.cat}</Badge> },
      { key: 'out', label: 'Out', align: 'r', render: (r: any, T: any) => r.out ? <span style={{ fontFamily: T.fMono, color: T.red }}>−{money(r.out)}</span> : <span style={{ color: T.inkMute }}>—</span> },
      { key: 'in', label: 'In', align: 'r', render: (r: any, T: any) => r.in ? <span style={{ fontFamily: T.fMono, color: T.green }}>+{money(r.in)}</span> : <span style={{ color: T.inkMute }}>—</span> },
      { key: 'bal', label: 'Balance', align: 'r', render: M('bal') },
    ], rows: PETTY_CASH,
  },
  adjustments: {
    title: 'Adjustments', subtitle: 'Stock corrections', add: '+ New Adjustment',
    stats: [['This week', ADJUSTMENTS.length], ['Units written off', 13], ['Top reason', 'Expiry']],
    cols: [
      { key: 'id', label: 'Ref', render: (r: any, T: any) => <b style={{ fontFamily: T.fMono, color: T.accent.text }}>{r.id}</b> },
      { key: 'product', label: 'Product' },
      { key: 'reason', label: 'Reason', render: (r: any, T: any) => <Badge T={T} tone={r.reason === 'Damage' || r.reason === 'Expiry' ? 'red' : 'gray'}>{r.reason}</Badge> },
      { key: 'qty', label: 'Qty', align: 'r', render: (r: any, T: any) => <span style={{ fontFamily: T.fMono, fontWeight: 600, color: r.qty < 0 ? T.red : T.green }}>{r.qty > 0 ? '+' : ''}{r.qty}</span> },
      { key: 'by', label: 'By' },
      { key: 'date', label: 'Date', align: 'r' },
    ], rows: ADJUSTMENTS,
  },
  transfers: {
    title: 'Transfers', subtitle: 'Stock between locations', add: '+ New Transfer',
    stats: [['In transit', TRANSFERS.filter((t: any) => t.status === 'in transit').length], ['Received', TRANSFERS.filter((t: any) => t.status === 'received').length], ['This month', TRANSFERS.length]],
    cols: [
      { key: 'id', label: 'Ref', render: (r: any, T: any) => <b style={{ fontFamily: T.fMono, color: T.accent.text }}>{r.id}</b> },
      { key: 'from', label: 'From' },
      { key: 'to', label: 'To' },
      { key: 'items', label: 'Items', align: 'r', mono: true },
      { key: 'status', label: 'Status', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'received' ? 'green' : r.status === 'cancelled' ? 'gray' : 'blue'}>{r.status}</Badge> },
      { key: 'date', label: 'Date', align: 'r' },
    ], rows: TRANSFERS,
  },
  users: {
    title: 'Users', subtitle: `${USERS.length} team members`, add: '+ Invite User',
    stats: [['Team members', USERS.length], ['Active', USERS.filter((u: any) => u.status === 'active').length], ['Managers', USERS.filter((u: any) => u.role === 'Manager' || u.role === 'Owner').length]],
    cols: [
      { key: 'name', label: 'Name', render: (r: any, T: any) => <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: T.navyLight, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{r.name.split(' ').map((n: any) => n[0]).join('').slice(0, 2)}</span><b style={{ color: T.ink }}>{r.name}</b></span> },
      { key: 'role', label: 'Role', render: (r: any, T: any) => <Badge T={T} tone={r.role === 'Owner' ? 'amber' : r.role === 'Manager' ? 'blue' : 'gray'}>{r.role}</Badge> },
      { key: 'email', label: 'Email', mono: true },
      { key: 'last', label: 'Last active', align: 'r', render: (r: any, T: any) => <span style={{ color: r.last === 'Online now' ? T.greenText : T.inkSub }}>{r.last}</span> },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'active' ? 'green' : 'gray'}>{r.status}</Badge> },
    ], rows: USERS,
  },
  projects: {
    title: 'Projects', subtitle: `${PROJECTS.length} projects`, add: '+ New Project',
    stats: [['Active', PROJECTS.filter((p: any) => p.status === 'active').length], ['Total budget', money0(PROJECTS.reduce((s: number, p: any) => s + p.budget, 0))], ['Completed', PROJECTS.filter((p: any) => p.status === 'completed').length]],
    cols: [
      { key: 'name', label: 'Project', render: (r: any, T: any) => <b style={{ color: T.ink }}>{r.name}</b> },
      { key: 'client', label: 'Client / Dept', render: (r: any, T: any) => <Badge T={T} tone="gray">{r.client}</Badge> },
      { key: 'budget', label: 'Budget', align: 'r', render: M('budget') },
      { key: 'progress', label: 'Progress', render: (r: any, T: any) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 150 }}><span style={{ flex: 1, height: 6, background: T.paperSink, borderRadius: 99 }}><span style={{ display: 'block', height: '100%', width: r.progress + '%', background: r.progress === 100 ? T.green : T.accent.base, borderRadius: 99 }} /></span><span style={{ fontFamily: T.fMono, fontSize: 12, color: T.inkSub }}>{r.progress}%</span></span> },
      { key: 'due', label: 'Due', align: 'r' },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'completed' ? 'green' : 'blue'}>{r.status}</Badge> },
    ], rows: PROJECTS,
  },
  tasks: {
    title: 'Tasks', subtitle: `${TASKS.filter((t: any) => t.status === 'open').length} open`, add: '+ New Task',
    stats: [['Open', TASKS.filter((t: any) => t.status === 'open').length], ['High priority', TASKS.filter((t: any) => t.priority === 'High').length], ['Done today', TASKS.filter((t: any) => t.status === 'done').length]],
    cols: [
      { key: 'task', label: 'Task', render: (r: any, T: any) => <b style={{ color: T.ink, fontWeight: 500, textDecoration: r.status === 'done' ? 'line-through' : 'none', opacity: r.status === 'done' ? 0.55 : 1 }}>{r.task}</b> },
      { key: 'assignee', label: 'Assignee' },
      { key: 'priority', label: 'Priority', render: (r: any, T: any) => <Badge T={T} tone={r.priority === 'High' ? 'red' : r.priority === 'Medium' ? 'amber' : 'gray'}>{r.priority}</Badge> },
      { key: 'due', label: 'Due', align: 'r' },
      { key: 'status', label: 'Status', align: 'r', render: (r: any, T: any) => <Badge T={T} tone={r.status === 'done' ? 'green' : 'blue'}>{r.status}</Badge> },
    ], rows: TASKS,
  },
};
