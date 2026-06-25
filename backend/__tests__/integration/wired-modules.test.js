/**
 * Integration tests for the modules wired in the real-backend effort:
 * module gating + plan defaults, reports-after-sale regression, expenses,
 * payment accounts, customer groups, discounts, invoicing, HRM, superadmin,
 * service types.
 *
 * Requires TEST_DATABASE_URL (see jest.setup.js). Each suite registers its own
 * business so they're independent.
 */
const request = require('supertest');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const { app } = require('../../server');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');
const { requireModule } = require('../../lib/moduleGate');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let SEQ = 0;
async function register() {
  const s = `${Date.now()}_${SEQ++}`;
  const res = await request(app).post('/api/v1/auth/register').send({
    businessName: `Wired ${s}`, email: `wired_${s}@balanzify.test`, password: 'SecureTestPass123!',
  });
  expect(res.status).toBe(201);
  return res.body.access_token;
}
async function enableModule(token, key) {
  // Paid add-ons require an active subscription (and the platform console is
  // never self-grantable) in the real authorization model. Tests exercise the
  // module FEATURES, not the billing/enable path, so seed the licensed state
  // directly: an active subscription + the module in enabledModules.
  const { businessId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  await prisma.moduleSubscription.upsert({
    where:  { businessId_module: { businessId, module: key } },
    update: { status: 'active' },
    create: { businessId, module: key, status: 'active', priceMonthly: 0 },
  });
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { enabledModules: true } });
  const enabledModules = [...new Set([...(biz.enabledModules || []), key])];
  await prisma.business.update({ where: { id: businessId }, data: { enabledModules } });
  requireModule.invalidate(businessId); // clear the 60s gate cache so the change is visible now
}
async function stockedProduct(token, locationId, price = 10, stock = 100) {
  const p = await request(app).post('/api/v1/products').set(auth(token))
    .send({ name: `P${Date.now()}_${SEQ++}`, selling_price: price, cost_price: 5, opening_stock: stock, location_id: locationId });
  expect(p.status).toBe(201);
  const id = p.body.id;
  await prisma.costLayer.create({ data: { businessId: p.body.businessId, productId: id, locationId, quantityReceived: stock, quantityRemaining: stock, unitCost: 5 } });
  return id;
}
async function location(token) {
  const r = await request(app).post('/api/v1/locations').set(auth(token)).send({ name: 'Main', type: 'store' });
  return r.body.id;
}
async function makeSale(token, locationId, productId, { qty = 2, price = 10, discount = 0 } = {}) {
  await request(app).post('/api/v1/sales/shifts/open').set(auth(token)).send({ location_id: locationId, opening_float: 100 });
  const ik = (await request(app).post('/api/v1/sales/initiate').set(auth(token))).body.idempotency_key;
  return request(app).post('/api/v1/sales').set(auth(token)).send({
    idempotency_key: ik, items: [{ product_id: productId, quantity: qty, override_price: price }],
    location_id: locationId, payment_method: 'cash', discount_type: 'flat', discount_value: discount, cash_tendered: qty * price,
  });
}
// Capture + verify financing KYC so disbursement's compliance gate passes.
// Returns the id number used (handy for blacklist tests).
async function passKyc(token, idNumber) {
  const idNo = idNumber || `ID${Date.now()}_${SEQ++}`;
  await request(app).put('/api/v1/lending/kyc').set(auth(token)).send({ legal_name: 'Test Owner', id_type: 'national_id', id_number: idNo });
  await request(app).post('/api/v1/lending/kyc/decision').set(auth(token)).send({ decision: 'verified' });
  return idNo;
}

describe('module gating & plan defaults', () => {
  let token;
  beforeAll(async () => { token = await register(); });

  test('base plan = core/pos/inventory/operations; add-ons off', async () => {
    const res = await request(app).get('/api/v1/modules').set(auth(token));
    expect(res.status).toBe(200);
    expect([...res.body.plan.effective].sort()).toEqual(['core', 'inventory', 'operations', 'pos']);
  });

  test('add-on route 403 until enabled, then 200, then 403 when disabled', async () => {
    expect((await request(app).get('/api/v1/hrm/summary').set(auth(token))).status).toBe(403);
    await enableModule(token, 'hrm');
    expect((await request(app).get('/api/v1/hrm/summary').set(auth(token))).status).toBe(200);
    await request(app).put('/api/v1/modules').set(auth(token)).send({ enabledModules: ['core', 'pos', 'inventory', 'operations'] });
    expect((await request(app).get('/api/v1/hrm/summary').set(auth(token))).status).toBe(403);
  });
});

describe('reports after a sale (regression: BigInt + $queryRaw)', () => {
  let token, loc, prod;
  beforeAll(async () => { token = await register(); loc = await location(token); prod = await stockedProduct(token, loc); });

  test('dashboard + sales report do not 500 once a sale exists', async () => {
    const sale = await makeSale(token, loc, prod, { qty: 2, price: 10 });
    expect(sale.status).toBe(201);
    const dash = await request(app).get('/api/v1/reports/dashboard').set(auth(token));
    expect(dash.status).toBe(200);
    expect(dash.body.transactions_today).toBe(1);
    // real hourly breakdown: 14 buckets (8:00–21:00) for the dashboard chart
    expect(Array.isArray(dash.body.hourly)).toBe(true);
    expect(dash.body.hourly.length).toBe(14);
    // sales history list is live + carries a real per-sale item count
    const hist = await request(app).get('/api/v1/sales').set(auth(token));
    expect(hist.status).toBe(200);
    expect(hist.body.sales.length).toBeGreaterThan(0);
    expect(hist.body.sales[0]._count.items).toBe(1);

    // revenue-by-category report reflects the sale
    const byCat = await request(app).get('/api/v1/reports/sales-by-category').set(auth(token));
    expect(byCat.status).toBe(200);
    expect(Array.isArray(byCat.body.categories)).toBe(true);
    expect(byCat.body.categories.reduce((s, c) => s + c.revenue, 0)).toBeGreaterThan(0);

    const sales = await request(app).get('/api/v1/reports/sales').set(auth(token));
    expect(sales.status).toBe(200);
    expect(sales.body.totals._count.id).toBe(1);
    expect(Array.isArray(sales.body.by_day)).toBe(true);
  });
});

describe('expenses', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('category + expense CRUD', async () => {
    const cat = await request(app).post('/api/v1/expense-categories').set(auth(token)).send({ name: 'Utilities' });
    expect(cat.status).toBe(201);
    const exp = await request(app).post('/api/v1/expenses').set(auth(token)).send({ category_id: cat.body.id, amount: 25, date: '2026-06-16', payment_status: 'paid' });
    expect(exp.status).toBe(201);
    const list = await request(app).get('/api/v1/expenses').set(auth(token));
    expect(list.body.expenses).toHaveLength(1);
    expect(list.body.expenses[0].category.name).toBe('Utilities');
    expect((await request(app).delete(`/api/v1/expenses/${exp.body.id}`).set(auth(token))).status).toBe(200);
    expect((await request(app).post('/api/v1/expenses').set(auth(token)).send({ amount: 0 })).status).toBe(422);
  });

  test('a paid expense posts Dr Operating Expenses / Cr Cash', async () => {
    const exp = await request(app).post('/api/v1/expenses').set(auth(token)).send({ amount: 40, date: '2026-06-17', payment_status: 'paid' });
    expect(exp.status).toBe(201);
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'expense', sourceId: exp.body.id },
      include: { lines: { include: { account: true } } },
    });
    expect(entry).toBeTruthy();
    const by = {};
    for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['5200'].debit)).toBeCloseTo(40, 2);  // Operating Expenses
    expect(parseFloat(by['1000'].credit)).toBeCloseTo(40, 2); // Cash
  });
});

describe('payment accounts', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('create, deposit, atomic transfer, insufficient guard', async () => {
    const a = (await request(app).post('/api/v1/payment-accounts').set(auth(token)).send({ name: 'Cash', type: 'Cash', balance: 100 })).body;
    const b = (await request(app).post('/api/v1/payment-accounts').set(auth(token)).send({ name: 'Bank', type: 'Bank', balance: 0 })).body;
    await request(app).post(`/api/v1/payment-accounts/${a.id}/deposit`).set(auth(token)).send({ amount: 50 });
    const t = await request(app).post('/api/v1/payment-accounts/transfer').set(auth(token)).send({ from_id: a.id, to_id: b.id, amount: 40 });
    expect(t.status).toBe(200);
    const list = (await request(app).get('/api/v1/payment-accounts').set(auth(token))).body.accounts;
    expect(parseFloat(list.find(x => x.id === a.id).balance)).toBe(110);
    expect(parseFloat(list.find(x => x.id === b.id).balance)).toBe(40);
    expect((await request(app).post('/api/v1/payment-accounts/transfer').set(auth(token)).send({ from_id: a.id, to_id: b.id, amount: 9999 })).status).toBe(400);
  });
});

describe('customer groups', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('group upsert + customer link + FK null on delete', async () => {
    const g = (await request(app).post('/api/v1/customer-groups').set(auth(token)).send({ name: 'VIP', amount: -10 })).body;
    const c = (await request(app).post('/api/v1/customers').set(auth(token)).send({ name: 'Khadija', customer_group_id: g.id })).body;
    expect(c.customerGroupId).toBe(g.id);
    await request(app).delete(`/api/v1/customer-groups/${g.id}`).set(auth(token));
    const got = (await request(app).get(`/api/v1/customers/${c.id}`).set(auth(token))).body;
    expect(got.customerGroupId).toBeNull();
  });
});

describe('discounts', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('create + partial toggle keeps other fields', async () => {
    const d = (await request(app).post('/api/v1/discounts').set(auth(token)).send({ name: 'Promo', type: 'percentage', value: 10, priority: 5 })).body;
    expect(d.value).toBeDefined();
    const upd = await request(app).put(`/api/v1/discounts/${d.id}`).set(auth(token)).send({ is_active: false });
    expect(upd.status).toBe(200);
    expect(upd.body.isActive).toBe(false);
    expect(parseFloat(upd.body.value)).toBe(10); // untouched
    expect((await request(app).post('/api/v1/discounts').set(auth(token)).send({ name: 'x', type: 'bogus', value: 1 })).status).toBe(422);
  });
});

describe('invoicing', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('first layout auto-defaults; default exclusivity + delete guard', async () => {
    const l1 = (await request(app).post('/api/v1/invoice-layouts').set(auth(token)).send({ name: 'Classic' })).body;
    expect(l1.isDefault).toBe(true);
    const l2 = (await request(app).post('/api/v1/invoice-layouts').set(auth(token)).send({ name: 'Elegant' })).body;
    await request(app).put(`/api/v1/invoice-layouts/${l2.id}`).set(auth(token)).send({ is_default: true });
    const list = (await request(app).get('/api/v1/invoice-layouts').set(auth(token))).body.layouts;
    expect(list.filter(x => x.isDefault)).toHaveLength(1);
    expect((await request(app).delete(`/api/v1/invoice-layouts/${l2.id}`).set(auth(token))).status).toBe(422); // default protected
  });
});

describe('HRM', () => {
  let token, loc;
  beforeAll(async () => { token = await register(); await enableModule(token, 'hrm'); loc = await location(token); });
  test('employee + attendance summary + advance recovered by payroll', async () => {
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Amina', salary: 800 })).body;
    // attendance: clock in 08:05 (present within grace) then out 17:05
    await request(app).post('/api/v1/hrm/attendance/clock').set(auth(token)).send({ employee_id: e.id, at: '08:05', date: '2026-06-16' });
    await request(app).post('/api/v1/hrm/attendance/clock').set(auth(token)).send({ employee_id: e.id, at: '17:05', date: '2026-06-16' });
    const sum = (await request(app).get('/api/v1/hrm/attendance-summary/' + e.id + '?month=2026-06').set(auth(token))).body;
    expect(sum.present).toBe(1);
    expect(sum.total_hours).toBeCloseTo(9, 1);
    // advance 150 then payroll deduction 200 recovers it (settled)
    const acc = (await request(app).post('/api/v1/payment-accounts').set(auth(token)).send({ name: 'Cash', type: 'Cash', balance: 1000 })).body;
    await request(app).post('/api/v1/hrm/advance').set(auth(token)).send({ employee_id: e.id, amount: 150, date: '2026-06-01', account_id: acc.id });
    const pay = (await request(app).post('/api/v1/hrm/payroll').set(auth(token)).send({ employee_id: e.id, month: '2026-06', basic: 800, deduction: 200 })).body;
    expect(parseFloat(pay.net)).toBe(600);
    expect(parseFloat(pay.advance_recovered)).toBe(150);
    expect((await request(app).get('/api/v1/hrm/advance/outstanding/' + e.id).set(auth(token))).body.outstanding).toBe(0);

    // GL: the advance posted a receivable (Dr 1110) when it was paid out…
    const bizId = (await prisma.employee.findUnique({ where: { id: e.id } })).businessId;
    const advEntry = await prisma.journalEntry.findFirst({
      where: { businessId: bizId, sourceType: 'hr_advance' },
      include: { lines: { include: { account: true } } },
    });
    expect(advEntry).toBeTruthy();
    const advBy = {};
    for (const l of advEntry.lines) advBy[l.account.code] = l;
    expect(parseFloat(advBy['1110'].debit)).toBeCloseTo(150, 2); // Employee Advances (receivable)

    // GL: payroll gross (800) = net cash (600) + advance recovered (150) + withholding (50).
    // The recovered portion CLEARS the receivable (Cr 1110) — it is NOT a new
    // payable, so only the genuine 50 lands in Tax Payable.
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'payroll', sourceId: pay.id },
      include: { lines: { include: { account: true } } },
    });
    expect(entry).toBeTruthy();
    const by = {};
    for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['5100'].debit)).toBeCloseTo(800, 2);  // Salaries & Wages expense
    expect(parseFloat(by['1000'].credit)).toBeCloseTo(600, 2); // Net pay (cash)
    expect(parseFloat(by['1110'].credit)).toBeCloseTo(150, 2); // Advance recovered (clears receivable)
    expect(parseFloat(by['2100'].credit)).toBeCloseTo(50, 2);  // Genuine withholding only

    // Net effect on the Employee Advances account is zero — paid out then recovered.
    const bal = await accounting.accountBalances(bizId);
    const advAcct = bal.find(a => a.code === '1110');
    expect(advAcct.balance).toBeCloseTo(0, 2);
  });
  test('overnight shift hours: 22:00 → 06:00 counts as 8h, not 0', async () => {
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Cabdi (night guard)', salary: 600 })).body;
    await request(app).post('/api/v1/hrm/attendance/clock').set(auth(token)).send({ employee_id: e.id, at: '22:00', date: '2026-06-10' });
    await request(app).post('/api/v1/hrm/attendance/clock').set(auth(token)).send({ employee_id: e.id, at: '06:00', date: '2026-06-10' });
    const sum = (await request(app).get('/api/v1/hrm/attendance-summary/' + e.id + '?month=2026-06').set(auth(token))).body;
    expect(sum.total_hours).toBeCloseTo(8, 1);
  });
  test('leave accrual: a new hire has not yet earned a full month of annual leave', async () => {
    // Joined today → zero completed months of service → zero accrued annual leave
    // (the old code granted a whole month's entitlement on day one).
    const today = new Date().toISOString().slice(0, 10);
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Deeqa (new hire)', salary: 500, joined: today })).body;
    const bal = (await request(app).get('/api/v1/hrm/leave-balance/' + e.id).set(auth(token))).body;
    const annual = bal.find(b => b.type === 'Annual');
    expect(annual.entitled).toBe(0);
  });
  test('leave balance accrual + over-apply 422', async () => {
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Bashir', salary: 700, joined: '2026-01-01' })).body;
    const bal = (await request(app).get('/api/v1/hrm/leave-balance/' + e.id).set(auth(token))).body;
    const sick = bal.find(b => b.type === 'Sick');
    expect(sick.entitled).toBe(12);
    expect((await request(app).post('/api/v1/hrm/leave').set(auth(token)).send({ employee_id: e.id, type: 'Sick', from: '2026-07-01', to: '2026-07-30', days: 20 })).status).toBe(422);
  });
  test('payslip is distributable over WhatsApp', async () => {
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Farah', salary: 600 })).body;
    const pay = (await request(app).post('/api/v1/hrm/payroll').set(auth(token)).send({ employee_id: e.id, month: '2026-06', basic: 600, deduction: 0 })).body;
    const sent = await request(app).post(`/api/v1/hrm/payslip/${pay.id}/send-whatsapp`).set(auth(token)).send({ phone: '0614445' });
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe('link');               // zero-config provider fallback
    expect(sent.body.wa_url).toContain(encodeURIComponent('Net pay'));
  });

  test('Kenya statutory deductions: PAYE/NSSF/SHIF/Housing computed, posted, and filable', async () => {
    // Preview (no persistence) — the payroll screen shows this before running.
    const prev = (await request(app).post('/api/v1/hrm/payroll/compute').set(auth(token)).send({ gross: 50000, country: 'KE' })).body;
    expect(prev.nssf).toBeCloseTo(2160, 2);
    expect(prev.shif).toBeCloseTo(1375, 2);
    expect(prev.housing_levy).toBeCloseTo(750, 2);
    expect(prev.paye).toBeCloseTo(6416.60, 2);
    expect(prev.total_statutory).toBeCloseTo(10701.60, 2);
    expect(prev.net).toBeCloseTo(39298.40, 2);

    // Run payroll with statutory on → breakdown persisted, net is gross − statutory.
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Wanjiru', salary: 50000 })).body;
    const pay = (await request(app).post('/api/v1/hrm/payroll').set(auth(token)).send({ employee_id: e.id, month: '2026-09', basic: 50000, deduction: 0, statutory_country: 'KE' })).body;
    expect(parseFloat(pay.statutory_total)).toBeCloseTo(10701.60, 2);
    expect(parseFloat(pay.paye)).toBeCloseTo(6416.60, 2);
    expect(parseFloat(pay.net)).toBeCloseTo(39298.40, 2);

    // GL: gross to wages (5100), statutory withheld to Statutory Payable (2120), net in cash.
    const entry = await prisma.journalEntry.findFirst({ where: { sourceType: 'payroll', sourceId: pay.id }, include: { lines: { include: { account: true } } } });
    const by = {}; for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['5100'].debit)).toBeCloseTo(50000, 2);
    expect(parseFloat(by['2120'].credit)).toBeCloseTo(10701.60, 2);
    expect(parseFloat(by['1000'].credit)).toBeCloseTo(39298.40, 2);

    // Filing report aggregates the month — the figures filed with KRA/NSSF/SHA.
    const rep = (await request(app).get('/api/v1/hrm/payroll/statutory-report?month=2026-09').set(auth(token))).body;
    expect(rep.employees).toBe(1);
    expect(rep.totals.paye).toBeCloseTo(6416.60, 2);
    expect(rep.totals.total).toBeCloseTo(10701.60, 2);
    expect(rep.lines[0].employee).toBe('Wanjiru');
  });
});

describe('superadmin (opt-in, cross-tenant)', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('403 by default, then lists businesses + stats after enable', async () => {
    expect((await request(app).get('/api/v1/superadmin/stats').set(auth(token))).status).toBe(403);
    await enableModule(token, 'superadmin');
    const stats = await request(app).get('/api/v1/superadmin/stats').set(auth(token));
    expect(stats.status).toBe(200);
    expect(stats.body.businesses).toBeGreaterThanOrEqual(1);
    const biz = await request(app).get('/api/v1/superadmin/business').set(auth(token));
    expect(Array.isArray(biz.body)).toBe(true);
    expect((await request(app).get('/api/v1/superadmin/package').set(auth(token))).body.length).toBeGreaterThanOrEqual(3);
  });

  test('can enable/disable a module for a specific business (base preserved)', async () => {
    await enableModule(token, 'superadmin');   // operator
    const targetToken = await register();
    const targetId = (await request(app).get('/api/v1/auth/me').set(auth(targetToken))).body.business_id;
    // target has no hotel yet
    expect((await request(app).get('/api/v1/hotel/rooms').set(auth(targetToken))).status).toBe(403);
    const cat = await request(app).get('/api/v1/superadmin/module-catalog').set(auth(token));
    expect(cat.body.modules.find(m => m.key === 'hotel' && m.addon)).toBeTruthy();
    // operator turns hotel on for the target
    const upd = await request(app).put(`/api/v1/superadmin/business/${targetId}/modules`).set(auth(token)).send({ enabled_modules: ['hotel'] });
    expect(upd.status).toBe(200);
    expect(upd.body.enabled_modules).toContain('hotel');
    expect(upd.body.enabled_modules).toContain('pos');   // base plan preserved
    expect((await request(app).get('/api/v1/hotel/rooms').set(auth(targetToken))).status).toBe(200);
    // and can turn it back off
    expect((await request(app).put(`/api/v1/superadmin/business/${targetId}/modules`).set(auth(token)).send({ enabled_modules: [] })).status).toBe(200);
    expect((await request(app).get('/api/v1/hotel/rooms').set(auth(targetToken))).status).toBe(403);
  });
});

describe('service types (restaurant-gated)', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('403 until restaurant enabled, then lazy-seeded, enabled-only vs all', async () => {
    expect((await request(app).get('/api/v1/service-types').set(auth(token))).status).toBe(403);
    await enableModule(token, 'restaurant');
    const seeded = (await request(app).get('/api/v1/service-types').set(auth(token))).body;
    expect(seeded.map(s => s.name)).toEqual(expect.arrayContaining(['Dine-in', 'Delivery']));
    const all = (await request(app).get('/api/v1/service-types?all=1').set(auth(token))).body;
    const delivery = all.find(s => s.name === 'Delivery');
    await request(app).put(`/api/v1/service-types/${delivery.id}`).set(auth(token)).send({ enabled: false });
    const posList = (await request(app).get('/api/v1/service-types').set(auth(token))).body;
    expect(posList.find(s => s.name === 'Delivery')).toBeUndefined();
  });
});

describe('pharmacy (gated)', () => {
  let token, loc;
  beforeAll(async () => { token = await register(); await enableModule(token, 'pharmacy'); loc = await location(token); });
  test('403 until enabled, drug catalog + unit-selling config, expiry write-off', async () => {
    const fresh = await register();
    expect((await request(app).get('/api/v1/pharmacy/dashboard').set(auth(fresh))).status).toBe(403);

    const pid = await stockedProduct(token, loc, 2, 40);
    const drugs = (await request(app).get('/api/v1/pharmacy/drugs').set(auth(token))).body.drugs;
    expect(drugs.find(d => d.id === pid).total_stock).toBe(40);
    const cfg = await request(app).put(`/api/v1/pharmacy/drugs/${pid}`).set(auth(token))
      .send({ genericName: 'Amoxicillin', strength: '500mg', formulation: 'capsule', sellByUnit: true, packSize: 10, unitPrice: 0.25, unitName: 'capsule' });
    expect(cfg.status).toBe(200);
    expect(cfg.body.sellByUnit).toBe(true);

    // expired batch -> dashboard exposure -> pull-expired clears it
    const batch = await prisma.stockBatch.create({ data: { productId: pid, locationId: loc, batchNumber: 'B-OLD', quantity: 10, costPrice: 1, expiryDate: new Date('2025-01-01') } });
    let dash = (await request(app).get('/api/v1/pharmacy/dashboard').set(auth(token))).body;
    expect(dash.expiry_exposure.expired_batches).toBe(1);
    expect(dash.expiry_exposure.expired_value_at_cost).toBe(50); // 10 units x product cost 5 (dashboard values at product cost)
    const pull = await request(app).post('/api/v1/pharmacy/pull-expired').set(auth(token)).send({ batch_id: batch.id });
    expect(pull.status).toBe(200);
    dash = (await request(app).get('/api/v1/pharmacy/dashboard').set(auth(token))).body;
    expect(dash.expiry_exposure.expired_batches).toBe(0);
  });
});

describe('loyalty (rich reward settings)', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('defaults shape, save rich settings, persist + typed sync', async () => {
    const def = (await request(app).get('/api/v1/loyalty/rules').set(auth(token))).body;
    expect(def.display_name).toBe('Reward Points');
    expect(def.amount_per_unit_point).toBe(1);
    const saved = await request(app).put('/api/v1/loyalty/rules').set(auth(token))
      .send({ enabled: true, display_name: 'Stars', amount_per_unit_point: 2, max_points_per_order: 50, redeem_amount_per_point: 0.05, min_redeem_point: 20 });
    expect(saved.status).toBe(200);
    expect(saved.body.display_name).toBe('Stars');
    const reload = (await request(app).get('/api/v1/loyalty/rules').set(auth(token))).body;
    expect(reload.display_name).toBe('Stars');
    expect(reload.max_points_per_order).toBe(50);
    expect(reload.min_redeem_point).toBe(20);
    expect(Array.isArray((await request(app).get('/api/v1/loyalty/members').set(auth(token))).body)).toBe(true);
  });
});

describe('coupons', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('create, validate (discount + min-purchase), duplicate 409, toggle', async () => {
    const c = await request(app).post('/api/v1/coupons').set(auth(token)).send({ code: 'WEEKEND10', type: 'pct', value: 10, min_purchase: 20 });
    expect(c.status).toBe(201);
    const ok = await request(app).post('/api/v1/coupons/validate').set(auth(token)).send({ code: 'WEEKEND10', subtotal: 100 });
    expect(ok.status).toBe(200);
    expect(ok.body.discount).toBe(10);
    expect((await request(app).post('/api/v1/coupons/validate').set(auth(token)).send({ code: 'WEEKEND10', subtotal: 10 })).status).toBe(400); // below min
    expect((await request(app).post('/api/v1/coupons').set(auth(token)).send({ code: 'WEEKEND10', type: 'pct', value: 5 })).status).toBe(409); // dup
    const upd = await request(app).put(`/api/v1/coupons/${c.body.id}`).set(auth(token)).send({ is_active: false });
    expect(upd.status).toBe(200);
  });

  test('redeems at checkout — sale applies coupon_discount and increments uses_count', async () => {
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 10, 100);
    const c = await request(app).post('/api/v1/coupons').set(auth(token)).send({ code: 'CHECKOUT5', type: 'flat', value: 5 });
    expect(c.status).toBe(201);
    const v = await request(app).post('/api/v1/coupons/validate').set(auth(token)).send({ code: 'CHECKOUT5', subtotal: 20 });
    expect(v.status).toBe(200);
    expect(v.body.discount).toBe(5);
    const couponId = v.body.coupon.id;

    await request(app).post('/api/v1/sales/shifts/open').set(auth(token)).send({ location_id: loc, opening_float: 100 });
    const ik = (await request(app).post('/api/v1/sales/initiate').set(auth(token))).body.idempotency_key;
    const sale = await request(app).post('/api/v1/sales').set(auth(token)).send({
      idempotency_key: ik, items: [{ product_id: prod, quantity: 2, override_price: 10 }],
      location_id: loc, payment_method: 'cash', coupon_id: couponId, coupon_discount: 5, cash_tendered: 100,
    });
    expect(sale.status).toBe(201);

    // the coupon's usage counter advanced — proof it was redeemed, not just validated
    const list = await request(app).get('/api/v1/coupons').set(auth(token));
    const updated = list.body.coupons.find(x => x.id === couponId);
    expect(updated.usesCount).toBe(1);
  });
});

describe('service-type packing charge on a sale', () => {
  let token, loc, prod;
  beforeAll(async () => { token = await register(); loc = await location(token); prod = await stockedProduct(token, loc, 10, 100); });
  test('packing_charge is recorded and added to the total', async () => {
    await request(app).post('/api/v1/sales/shifts/open').set(auth(token)).send({ location_id: loc, opening_float: 100 });
    const ik = (await request(app).post('/api/v1/sales/initiate').set(auth(token))).body.idempotency_key;
    const r = await request(app).post('/api/v1/sales').set(auth(token)).send({
      idempotency_key: ik, items: [{ product_id: prod, quantity: 2, override_price: 10 }],
      location_id: loc, payment_method: 'cash', packing_charge: 3, cash_tendered: 100,
    });
    expect(r.status).toBe(201);
    expect(Number(r.body.packingCharge)).toBe(3);
    // total = subtotal + tax + packing (no discount/coupon on this sale)
    expect(Number(r.body.totalAmount)).toBe(Number(r.body.subtotal) + Number(r.body.taxAmount) + 3);
  });
});

describe('auth depth (MFA, password change & recovery)', () => {
  async function registerFull() {
    const s = `${Date.now()}_${SEQ++}`;
    const email = `auth_${s}@balanzify.test`;
    const res = await request(app).post('/api/v1/auth/register').send({ businessName: `Auth ${s}`, email, password: 'SecureTestPass123!' });
    expect(res.status).toBe(201);
    return { token: res.body.access_token, email };
  }

  test('change-password: new password works, old is rejected', async () => {
    const { token, email } = await registerFull();
    const ch = await request(app).post('/api/v1/auth/change-password').set(auth(token)).send({ currentPassword: 'SecureTestPass123!', newPassword: 'BrandNewPass456!' });
    expect(ch.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/login').send({ email, password: 'BrandNewPass456!' })).body.access_token).toBeTruthy();
    expect((await request(app).post('/api/v1/auth/login').send({ email, password: 'SecureTestPass123!' })).status).toBe(401);
  });

  test('forgot is generic; reset rejects bad tokens and accepts a valid one', async () => {
    const { token, email } = await registerFull();
    const userId = (await request(app).get('/api/v1/auth/me').set(auth(token))).body.id;
    expect((await request(app).post('/api/v1/auth/forgot-password').send({ email })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@nowhere.test' })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token: 'a'.repeat(64), newPassword: 'ResetPass789!' })).status).toBe(400);
    // create a real reset token (the raw value is normally emailed)
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await prisma.passwordResetToken.create({ data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + 600000) } });
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token: raw, newPassword: 'ResetPass789!' })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/login').send({ email, password: 'ResetPass789!' })).body.access_token).toBeTruthy();
  });

  test('MFA: enrol → login challenge → verify', async () => {
    const { token, email } = await registerFull();
    const setup = await request(app).post('/api/v1/auth/mfa/setup').set(auth(token)).send({});
    expect(setup.status).toBe(200);
    const secret = setup.body.secret;
    expect(secret).toBeTruthy();
    const enable = await request(app).post('/api/v1/auth/mfa/enable').set(auth(token)).send({ token: speakeasy.totp({ secret, encoding: 'base32' }) });
    expect(enable.status).toBe(200);
    // login now returns an MFA challenge instead of tokens
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'SecureTestPass123!' });
    expect(login.body.mfa_required).toBe(true);
    expect(login.body.access_token).toBeUndefined();
    // exchange the pre-token + a fresh code for real tokens
    const verify = await request(app).post('/api/v1/auth/mfa/verify')
      .set({ Authorization: `Bearer ${login.body.pre_token}` })
      .send({ token: speakeasy.totp({ secret, encoding: 'base32' }) });
    expect(verify.status).toBe(200);
    expect(verify.body.access_token).toBeTruthy();

    // disable requires the correct password; afterwards login no longer challenges
    expect((await request(app).post('/api/v1/auth/mfa/disable').set(auth(token)).send({ password: 'wrong' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/mfa/disable').set(auth(token)).send({ password: 'SecureTestPass123!' })).status).toBe(200);
    const after = await request(app).post('/api/v1/auth/login').send({ email, password: 'SecureTestPass123!' });
    expect(after.body.mfa_required).toBeUndefined();
    expect(after.body.access_token).toBeTruthy();
  });
});

describe('PIN till-login', () => {
  let token, bizId;
  beforeAll(async () => {
    token = await register();
    bizId = (await request(app).get('/api/v1/auth/me').set(auth(token))).body.business_id;
  });

  test('a user with a PIN can sign in by PIN; edits without a PIN keep it', async () => {
    const email = `cashier_${Date.now()}_${SEQ++}@balanzify.test`;
    const created = await request(app).post('/api/v1/users').set(auth(token))
      .send({ name: 'Till Cashier', email, password: 'CashierPass123!', role: 'cashier', pin: '4821' });
    expect(created.status).toBe(201);
    const userId = created.body.id;

    // PIN sign-in within the business
    const pl = await request(app).post('/api/v1/auth/pin-login').send({ pin: '4821', business_id: bizId });
    expect(pl.status).toBe(200);
    expect(pl.body.access_token).toBeTruthy();
    expect(pl.body.user.name).toBe('Till Cashier');

    // editing the user without sending a PIN must NOT clear it
    const upd = await request(app).put(`/api/v1/users/${userId}`).set(auth(token)).send({ name: 'Till Cashier 2', role: 'cashier', is_active: true });
    expect(upd.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/pin-login').send({ pin: '4821', business_id: bizId })).status).toBe(200);

    // wrong PIN is rejected
    expect((await request(app).post('/api/v1/auth/pin-login').send({ pin: '0000', business_id: bizId })).status).toBe(401);
  });
});

describe('module billing', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('status not-configured without keys; checkout gated; non-paid module rejected', async () => {
    const st = await request(app).get('/api/v1/billing/status').set(auth(token));
    expect(st.status).toBe(200);
    expect(st.body.configured).toBe(false);   // no STRIPE_SECRET_KEY in the test env
    expect(Array.isArray(st.body.providers)).toBe(true);
    // paid add-on with no provider configured → 503
    expect((await request(app).post('/api/v1/billing/checkout').set(auth(token)).send({ module: 'hotel' })).status).toBe(503);
    // base/non-paid module is never billable → 400
    expect((await request(app).post('/api/v1/billing/checkout').set(auth(token)).send({ module: 'pos' })).status).toBe(400);
    // unknown provider → 501
    expect((await request(app).post('/api/v1/billing/checkout').set(auth(token)).send({ module: 'hotel', provider: 'zaad' })).status).toBe(501);
    expect((await request(app).get('/api/v1/billing/subscriptions').set(auth(token))).body.subscriptions).toEqual([]);
  });
});

describe('business profile (settings)', () => {
  let token;
  beforeAll(async () => { token = await register(); });
  test('get + update name/currency persists', async () => {
    const get = await request(app).get('/api/v1/settings').set(auth(token));
    expect(get.status).toBe(200);
    expect(get.body.name).toBeTruthy();
    const upd = await request(app).put('/api/v1/settings').set(auth(token)).send({ name: 'Renamed Biz', currency: 'KES' });
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe('Renamed Biz');
    expect(upd.body.currency).toBe('KES');
    const reget = await request(app).get('/api/v1/settings').set(auth(token));
    expect(reget.body.name).toBe('Renamed Biz');
    expect(reget.body.currency).toBe('KES');
  });
});

describe('hotel (PMS)', () => {
  let token;
  beforeAll(async () => { token = await register(); await enableModule(token, 'hotel'); });

  test('gated off by default', async () => {
    const other = await register();
    expect((await request(app).get('/api/v1/hotel/rooms').set(auth(other))).status).toBe(403);
  });

  test('lifecycle: room type → room → reservation → check-in → check-out', async () => {
    const rt = await request(app).post('/api/v1/hotel/room-types').set(auth(token)).send({ name: 'Standard', baseRate: 50, maxOccupancy: 2 });
    expect(rt.status).toBe(201);
    const room = await request(app).post('/api/v1/hotel/rooms').set(auth(token)).send({ roomTypeId: rt.body.id, number: '101', floor: 1 });
    expect(room.status).toBe(201);
    const roomId = room.body.id;

    const resv = await request(app).post('/api/v1/hotel/reservations').set(auth(token)).send({
      roomId, guestName: 'Jo Guest', guestPhone: '0700999', checkInDate: '2026-07-01', checkOutDate: '2026-07-03', ratePerNight: 50,
    });
    expect(resv.status).toBe(201);
    expect(resv.body.status).toBe('confirmed');
    expect(Number(resv.body.totalRoomCharge)).toBe(100); // 2 nights x 50
    const resId = resv.body.id;

    // booking marks the room reserved
    let rooms = (await request(app).get('/api/v1/hotel/rooms').set(auth(token))).body.rooms;
    expect(rooms.find(r => r.id === roomId).status).toBe('reserved');

    // check in → room occupied, folio opened
    expect((await request(app).post(`/api/v1/hotel/reservations/${resId}/checkin`).set(auth(token))).status).toBe(200);
    rooms = (await request(app).get('/api/v1/hotel/rooms').set(auth(token))).body.rooms;
    expect(rooms.find(r => r.id === roomId).status).toBe('occupied');

    // the room charge (2 nights x 50) is posted to the folio at check-in
    const rChk = (await request(app).get('/api/v1/hotel/reservations').set(auth(token))).body.reservations.find(x => x.id === resId);
    expect(Number(rChk.folio.balance)).toBe(100);
    // settle the folio, then check out → housekeeping task auto-created
    await request(app).post(`/api/v1/hotel/folios/${rChk.folio.id}/payments`).set(auth(token)).send({ provider: 'cash', amount: 100 });
    expect((await request(app).post(`/api/v1/hotel/reservations/${resId}/checkout`).set(auth(token))).status).toBe(200);
    const hk = await request(app).get('/api/v1/hotel/housekeeping').set(auth(token));
    expect(hk.body.tasks.length).toBeGreaterThan(0);

    const dash = await request(app).get('/api/v1/hotel/dashboard').set(auth(token));
    expect(dash.status).toBe(200);
    expect(dash.body).toHaveProperty('occupancy_pct');
  });

  test('folio: charge raises balance, blocks checkout until paid', async () => {
    const rt = await request(app).post('/api/v1/hotel/room-types').set(auth(token)).send({ name: 'Deluxe', baseRate: 80, maxOccupancy: 2 });
    const room = await request(app).post('/api/v1/hotel/rooms').set(auth(token)).send({ roomTypeId: rt.body.id, number: '201' });
    const resv = await request(app).post('/api/v1/hotel/reservations').set(auth(token)).send({ roomId: room.body.id, guestName: 'Folio Guest', checkInDate: '2026-08-01', checkOutDate: '2026-08-02', ratePerNight: 80 });
    const resId = resv.body.id;
    expect((await request(app).post(`/api/v1/hotel/reservations/${resId}/checkin`).set(auth(token))).status).toBe(200);

    const r = (await request(app).get('/api/v1/hotel/reservations').set(auth(token))).body.reservations.find(x => x.id === resId);
    const folioId = r.folio.id;

    // folio already carries the room charge (1 night x 80) posted at check-in
    let folio = (await request(app).get(`/api/v1/hotel/folios/${folioId}`).set(auth(token))).body;
    expect(Number(folio.totalCharges)).toBe(80);

    const ch = await request(app).post(`/api/v1/hotel/folios/${folioId}/charges`).set(auth(token)).send({ type: 'restaurant', description: 'Dinner', quantity: 2, unitAmount: 15, chargeDate: '2026-08-01' });
    expect(ch.status).toBe(201);
    folio = (await request(app).get(`/api/v1/hotel/folios/${folioId}`).set(auth(token))).body;
    expect(Number(folio.totalCharges)).toBe(110); // 80 room + 30 dinner
    expect(Number(folio.balance)).toBe(110);

    // outstanding balance blocks checkout
    expect((await request(app).post(`/api/v1/hotel/reservations/${resId}/checkout`).set(auth(token))).status).toBe(400);

    const pay = await request(app).post(`/api/v1/hotel/folios/${folioId}/payments`).set(auth(token)).send({ provider: 'cash', amount: 110 });
    expect(pay.status).toBe(201);
    folio = (await request(app).get(`/api/v1/hotel/folios/${folioId}`).set(auth(token))).body;
    expect(Number(folio.balance)).toBe(0);

    // settled → checkout succeeds
    expect((await request(app).post(`/api/v1/hotel/reservations/${resId}/checkout`).set(auth(token))).status).toBe(200);

    // GL: folio charges + payment posted to the one set of books, and it balances.
    // (This hotel business is all-cash and fully settled, so AR nets to 0 and the
    // cash taken equals the revenue booked.)
    const tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
    const rev  = tb.accounts.find(a => a.code === '4000').balance;
    const cash = tb.accounts.find(a => a.code === '1000').balance;
    const ar   = tb.accounts.find(a => a.code === '1100').balance;
    expect(ar).toBeCloseTo(0, 2);        // receivables fully settled
    expect(rev).toBeGreaterThanOrEqual(110); // at least this folio's charges booked
    expect(cash).toBeCloseTo(rev, 2);    // all-cash business: cash in == revenue
  });

  test('corporate account: create + list + month-end invoice', async () => {
    const c = await request(app).post('/api/v1/hotel/corporate').set(auth(token)).send({ companyName: 'Acme Corp', creditLimit: 5000, paymentTermsDays: 30 });
    expect(c.status).toBe(201);
    const list = await request(app).get('/api/v1/hotel/corporate').set(auth(token));
    expect(list.body.accounts.find(a => a.id === c.body.id)).toBeTruthy();
    const inv = await request(app).get(`/api/v1/hotel/corporate/${c.body.id}/invoice`).set(auth(token)).query({ month: '7', year: '2026' });
    expect(inv.status).toBe(200);
    expect(inv.body).toHaveProperty('balance_due');
    expect(Array.isArray(inv.body.reservations)).toBe(true);
  });

  test('group booking: create, attach a reservation, group check-in', async () => {
    const rt = await request(app).post('/api/v1/hotel/room-types').set(auth(token)).send({ name: 'Twin', baseRate: 60, maxOccupancy: 2 });
    const room = await request(app).post('/api/v1/hotel/rooms').set(auth(token)).send({ roomTypeId: rt.body.id, number: '301' });
    const resv = await request(app).post('/api/v1/hotel/reservations').set(auth(token)).send({ roomId: room.body.id, guestName: 'Group Guest', checkInDate: '2026-09-01', checkOutDate: '2026-09-02', ratePerNight: 60 });

    const g = await request(app).post('/api/v1/hotel/groups').set(auth(token)).send({ name: 'Summit Block', billingType: 'individual', checkInDate: '2026-09-01', checkOutDate: '2026-09-02', roomCount: 1, pax: 1 });
    expect(g.status).toBe(201);
    expect((await request(app).post(`/api/v1/hotel/groups/${g.body.id}/reservations`).set(auth(token)).send({ reservationId: resv.body.id })).status).toBe(200);
    // group detail now carries the reservation
    const detail = await request(app).get(`/api/v1/hotel/groups/${g.body.id}`).set(auth(token));
    expect(detail.body.reservations.find(r => r.id === resv.body.id)).toBeTruthy();
    // group check-in flips the reservation to checked_in
    const ci = await request(app).post(`/api/v1/hotel/groups/${g.body.id}/checkin`).set(auth(token));
    expect(ci.status).toBe(200);
    const after = (await request(app).get('/api/v1/hotel/reservations').set(auth(token)).query({ status: 'checked_in' })).body.reservations;
    expect(after.find(r => r.id === resv.body.id)).toBeTruthy();
  });
});

describe('construction (job costing)', () => {
  let token, pid;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'construction');
    const p = await request(app).post('/api/v1/projects').set(auth(token)).send({ name: 'Block A', start_date: '2026-07-01', target_date: '2026-12-31', budget: 1500, status: 'active' });
    expect(p.status).toBe(201);
    pid = p.body.id;
  });

  test('gated off by default', async () => {
    const other = await register();
    expect((await request(app).get(`/api/v1/construction/${pid}/costing`).set(auth(other))).status).toBe(403);
  });

  test('budget vs actual rolls up material cost + labor log; milestones bill with retention', async () => {
    const mat = await request(app).post(`/api/v1/construction/${pid}/budget-lines`).set(auth(token)).send({ category: 'materials', description: 'Cement', budgeted: 1000 });
    expect(mat.status).toBe(201);
    await request(app).post(`/api/v1/construction/${pid}/budget-lines`).set(auth(token)).send({ category: 'labor', budgeted: 500 });
    // a spurious line can be re-budgeted then deleted (doesn't affect the assertions below)
    const tmp = await request(app).post(`/api/v1/construction/${pid}/budget-lines`).set(auth(token)).send({ category: 'equipment', budgeted: 999 });
    const edited = await request(app).put(`/api/v1/construction/budget-lines/${tmp.body.id}`).set(auth(token)).send({ budgeted: 250, description: 'Scaffolding' });
    expect(edited.status).toBe(200);
    expect(Number(edited.body.budgeted)).toBe(250);
    expect((await request(app).delete(`/api/v1/construction/budget-lines/${tmp.body.id}`).set(auth(token))).status).toBe(200);
    // record a material cost
    expect((await request(app).post(`/api/v1/construction/budget-lines/${mat.body.id}/cost`).set(auth(token)).send({ amount: 300 })).status).toBe(200);
    // log a labor day: 5 workers x 10 = 50
    const lab = await request(app).post(`/api/v1/construction/${pid}/labor`).set(auth(token)).send({ work_date: '2026-07-02', workers: 5, daily_rate: 10 });
    expect(lab.status).toBe(201);
    expect(Number(lab.body.total)).toBe(50);

    const costing = await request(app).get(`/api/v1/construction/${pid}/costing`).set(auth(token));
    expect(costing.status).toBe(200);
    expect(costing.body.totals.budgeted).toBe(1500);
    expect(costing.body.totals.actual).toBe(350); // 300 materials + 50 labor (rolled up)

    // milestone with 5% retention: held = 100, billable only once complete
    const ms = await request(app).post(`/api/v1/construction/${pid}/milestones`).set(auth(token)).send({ name: 'Foundation', amount: 2000, retention_pct: 5 });
    expect(ms.status).toBe(201);
    let list = (await request(app).get(`/api/v1/construction/${pid}/milestones`).set(auth(token))).body.milestones;
    expect(list[0].retention_held).toBe(100);
    expect(list[0].billable_now).toBeNull();
    expect((await request(app).put(`/api/v1/construction/milestones/${ms.body.id}/status`).set(auth(token)).send({ status: 'complete' })).status).toBe(200);
    list = (await request(app).get(`/api/v1/construction/${pid}/milestones`).set(auth(token))).body.milestones;
    expect(list[0].billable_now).toBe(1900); // 2000 * (1 - 0.05)
  });

  test('milestone billing raises real AR with retention; payment collects the net', async () => {
    const ms = await request(app).post(`/api/v1/construction/${pid}/milestones`).set(auth(token)).send({ name: 'Superstructure', amount: 2000, retention_pct: 5 });
    expect(ms.status).toBe(201);
    // can't bill a milestone that isn't complete yet
    expect((await request(app).put(`/api/v1/construction/milestones/${ms.body.id}/status`).set(auth(token)).send({ status: 'billed' })).status).toBe(422);

    // complete → billed: Dr AR 1900 + Dr Retention 100 / Cr Revenue 2000
    expect((await request(app).put(`/api/v1/construction/milestones/${ms.body.id}/status`).set(auth(token)).send({ status: 'complete' })).status).toBe(200);
    expect((await request(app).put(`/api/v1/construction/milestones/${ms.body.id}/status`).set(auth(token)).send({ status: 'billed' })).status).toBe(200);

    const bizId = (await prisma.project.findUnique({ where: { id: pid } })).businessId;
    let bal = await accounting.accountBalances(bizId);
    const at = (c) => (bal.find(a => a.code === c) || { balance: 0 }).balance;
    expect(at('1100')).toBeCloseTo(1900, 2); // Accounts Receivable
    expect(at('1120')).toBeCloseTo(100, 2);  // Retention Receivable held
    expect(at('4000')).toBeCloseTo(2000, 2); // Construction revenue (full value earned)

    // paid via mobile money: collects the net, retention stays receivable
    expect((await request(app).put(`/api/v1/construction/milestones/${ms.body.id}/status`).set(auth(token)).send({ status: 'paid', method: 'mpesa' })).status).toBe(200);
    bal = await accounting.accountBalances(bizId);
    expect(at('1100')).toBeCloseTo(0, 2);    // AR collected
    expect(at('1010')).toBeCloseTo(1900, 2); // Mobile Money received
    expect(at('1120')).toBeCloseTo(100, 2);  // retention still outstanding

    // idempotent — re-paying does not double-collect
    await request(app).put(`/api/v1/construction/milestones/${ms.body.id}/status`).set(auth(token)).send({ status: 'paid', method: 'mpesa' });
    bal = await accounting.accountBalances(bizId);
    expect(at('1010')).toBeCloseTo(1900, 2);
  });

  test('per-project tasks: create scoped to the project, advance status', async () => {
    const created = await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 'Order rebar', priority: 'high', status: 'not_started', due_date: '2026-07-10', project_id: pid });
    expect(created.status).toBe(201);
    // scoped list returns it
    const list = await request(app).get('/api/v1/tasks').set(auth(token)).query({ project_id: pid });
    expect(list.status).toBe(200);
    expect(list.body.tasks.find(t => t.id === created.body.id)).toBeTruthy();
    // advance status
    const upd = await request(app).put(`/api/v1/tasks/${created.body.id}`).set(auth(token)).send({ status: 'completed' });
    expect(upd.status).toBe(200);
    expect(upd.body.status).toBe('completed');
  });

  test('change orders: variation revises the budget and raises a billable milestone', async () => {
    const t = await register();
    await enableModule(t, 'construction');
    const p = await request(app).post('/api/v1/projects').set(auth(t)).send({ name: 'Variation Job', budget: 1000, status: 'active' });
    const id = p.body.id;
    await request(app).post(`/api/v1/construction/${id}/budget-lines`).set(auth(t)).send({ category: 'materials', budgeted: 1000 });

    const co = await request(app).post(`/api/v1/construction/${id}/change-orders`).set(auth(t))
      .send({ description: 'Add retaining wall', category: 'materials', cost_impact: 500, price_impact: 800 });
    expect(co.status).toBe(201);
    expect(co.body.status).toBe('pending');

    let listed = await request(app).get(`/api/v1/construction/${id}/change-orders`).set(auth(t));
    expect(listed.body.summary.pending_count).toBe(1);

    // approve → budget revised, milestone raised
    const appr = await request(app).put(`/api/v1/construction/change-orders/${co.body.id}/status`).set(auth(t)).send({ status: 'approved' });
    expect(appr.status).toBe(200);
    expect(appr.body.status).toBe('approved');
    expect(appr.body.milestoneId).toBeTruthy();

    const costing = await request(app).get(`/api/v1/construction/${id}/costing`).set(auth(t));
    expect(costing.body.totals.budgeted).toBe(1500); // 1000 base + 500 variation

    const ms = (await request(app).get(`/api/v1/construction/${id}/milestones`).set(auth(t))).body.milestones;
    expect(Number(ms.find(m => m.id === appr.body.milestoneId).amount)).toBe(800);

    listed = await request(app).get(`/api/v1/construction/${id}/change-orders`).set(auth(t));
    expect(listed.body.summary.approved_cost_impact).toBe(500);
    expect(listed.body.summary.approved_price_impact).toBe(800);

    // re-deciding a settled variation is rejected
    expect((await request(app).put(`/api/v1/construction/change-orders/${co.body.id}/status`).set(auth(t)).send({ status: 'approved' })).status).toBe(422);

    // a rejected variation has no budget effect
    const co2 = await request(app).post(`/api/v1/construction/${id}/change-orders`).set(auth(t)).send({ description: 'Scope cut', cost_impact: 200, price_impact: 0 });
    expect((await request(app).put(`/api/v1/construction/change-orders/${co2.body.id}/status`).set(auth(t)).send({ status: 'rejected' })).status).toBe(200);
    const costing2 = await request(app).get(`/api/v1/construction/${id}/costing`).set(auth(t));
    expect(costing2.body.totals.budgeted).toBe(1500); // unchanged by the rejected CO
  });

  test('material requisition: issues stock to the job — relieves inventory, books COGS, rolls into job cost', async () => {
    const t = await register();
    await enableModule(t, 'construction');
    const l = await location(t);
    const prod = await stockedProduct(t, l, 20, 100); // cost 5, stock 100
    const p = await request(app).post('/api/v1/projects').set(auth(t)).send({ name: 'Build', budget: 1000, status: 'active' });
    const id = p.body.id;
    const bizId = (await prisma.project.findUnique({ where: { id } })).businessId;
    const atOf = (bal, c) => (bal.find(a => a.code === c) || { balance: 0 }).balance;
    const inv0 = atOf(await accounting.accountBalances(bizId), '1200');

    // issue 10 units (cost 5 each = 50) to the job
    const r = await request(app).post(`/api/v1/construction/${id}/requisitions`).set(auth(t))
      .send({ location_id: l, notes: 'Foundation pour', items: [{ product_id: prod, quantity: 10 }] });
    expect(r.status).toBe(201);
    expect(Number(r.body.totalCost)).toBe(50);
    expect(r.body.items[0].quantity).toBe(10);

    // stock relieved: 100 - 10 = 90
    const lvl = await prisma.stockLevel.findFirst({ where: { productId: prod, locationId: l } });
    expect(lvl.quantity).toBe(90);

    // GL: COGS +50, inventory -50, books balanced
    const after = await accounting.accountBalances(bizId);
    expect(atOf(after, '5000')).toBeCloseTo(50, 2);
    expect(atOf(after, '1200') - inv0).toBeCloseTo(-50, 2);

    // job cost rolls up the issue under materials actual
    const costing = await request(app).get(`/api/v1/construction/${id}/costing`).set(auth(t));
    expect(costing.body.totals.actual).toBeCloseTo(50, 2);

    // can't over-issue what isn't on hand
    const over = await request(app).post(`/api/v1/construction/${id}/requisitions`).set(auth(t))
      .send({ location_id: l, items: [{ product_id: prod, quantity: 9999 }] });
    expect(over.status).toBe(400);

    // list reflects the issued requisition
    const list = await request(app).get(`/api/v1/construction/${id}/requisitions`).set(auth(t));
    expect(list.status).toBe(200);
    expect(list.body.total_cost).toBeCloseTo(50, 2);
  });
});

describe('wholesale', () => {
  let token, loc, prod, customerId;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'wholesale');
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 100);
    const c = await request(app).post('/api/v1/customers').set(auth(token)).send({ name: 'Corner Shop', phone: '0700111222' });
    expect(c.status).toBe(201);
    customerId = c.body.id;
  });

  test('gated off by default', async () => {
    const other = await register();
    expect((await request(app).get('/api/v1/wholesale/orders').set(auth(other))).status).toBe(403);
  });

  test('full lifecycle: create → pick → dispatch → deliver → payment → outstanding', async () => {
    // create
    const created = await request(app).post('/api/v1/wholesale/orders').set(auth(token))
      .send({ customer_id: customerId, items: [{ product_id: prod, quantity: 5 }], delivery_notes: 'Back gate' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(Number(created.body.total)).toBe(50);
    expect(created.body.status).toBe('pending');
    const itemIds = created.body.items.map(i => i.id);

    // appears in list
    const list = await request(app).get('/api/v1/wholesale/orders').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.orders.find(o => o.id === id)).toBeTruthy();

    // dispatch before pick → rejected
    expect((await request(app).post(`/api/v1/wholesale/orders/${id}/dispatch`).set(auth(token)).send({ driver_name: 'Sam' })).status).toBe(400);

    // pick all → status picked
    const picked = await request(app).post(`/api/v1/wholesale/orders/${id}/pick`).set(auth(token)).send({ item_ids: itemIds });
    expect(picked.status).toBe(200);
    expect(picked.body.fully_picked).toBe(true);

    // dispatch
    expect((await request(app).post(`/api/v1/wholesale/orders/${id}/dispatch`).set(auth(token)).send({ driver_name: 'Sam — Van 3' })).status).toBe(200);
    // deliver
    expect((await request(app).post(`/api/v1/wholesale/orders/${id}/deliver`).set(auth(token))).status).toBe(200);

    // partial payment → outstanding shows remaining
    const pay = await request(app).post(`/api/v1/wholesale/orders/${id}/payment`).set(auth(token)).send({ amount: 20 });
    expect(pay.status).toBe(200);
    expect(pay.body.payment_status).toBe('partial');

    const out = await request(app).get('/api/v1/wholesale/outstanding').set(auth(token));
    expect(out.status).toBe(200);
    const row = out.body.outstanding.find(o => o.customer === 'Corner Shop');
    expect(row).toBeTruthy();
    expect(row.outstanding).toBe(30);

    // settle the balance → drops off outstanding
    const pay2 = await request(app).post(`/api/v1/wholesale/orders/${id}/payment`).set(auth(token)).send({ amount: 30 });
    expect(pay2.body.payment_status).toBe('paid');
    const out2 = await request(app).get('/api/v1/wholesale/outstanding').set(auth(token));
    expect(out2.body.outstanding.find(o => o.customer === 'Corner Shop')).toBeFalsy();

    // GL: delivery booked revenue (50) to receivable; the two payments (20+30)
    // collected it. Books balance, AR settled, revenue == cash collected (50).
    const tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a => a.code === '1100').balance).toBeCloseTo(0, 2);  // receivable settled
    expect(tb.accounts.find(a => a.code === '4000').balance).toBeCloseTo(50, 2); // revenue
    expect(tb.accounts.find(a => a.code === '1000').balance).toBeCloseTo(50, 2); // cash collected
  });

  test('partial fulfillment: backorder shortfall, bill only what shipped', async () => {
    // Isolated business so the GL assertions stand alone.
    const t = await register();
    await enableModule(t, 'wholesale');
    const l = await location(t);
    const a = await stockedProduct(t, l, 10, 100); // price 10
    const b = await stockedProduct(t, l, 10, 100); // price 10
    const c = await request(app).post('/api/v1/customers').set(auth(t)).send({ name: 'Backorder Shop', phone: '0700333444' });
    const cust = c.body.id;

    // Order: line A qty 5 (=50), line B qty 4 (=40), total 90.
    const created = await request(app).post('/api/v1/wholesale/orders').set(auth(t))
      .send({ customer_id: cust, items: [{ product_id: a, quantity: 5 }, { product_id: b, quantity: 4 }] });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(Number(created.body.total)).toBe(90);
    const itemA = created.body.items.find(i => i.productId === a).id;
    const itemB = created.body.items.find(i => i.productId === b).id;

    // Fulfil A fully (5), B partially (2) → 2 units of B on backorder.
    const ful = await request(app).post(`/api/v1/wholesale/orders/${id}/fulfill`).set(auth(t))
      .send({ items: [{ item_id: itemA, qty: 5 }, { item_id: itemB, qty: 2 }] });
    expect(ful.status).toBe(200);
    expect(ful.body.status).toBe('partially_picked');
    expect(ful.body.fully_fulfilled).toBe(false);
    expect(ful.body.backorder_units).toBe(2);

    // Backorder report shows the B remainder.
    const bo = await request(app).get(`/api/v1/wholesale/orders/${id}/backorder`).set(auth(t));
    expect(bo.status).toBe(200);
    expect(bo.body.total_backorder_units).toBe(2);
    expect(bo.body.backorder).toHaveLength(1);
    expect(bo.body.backorder[0].item_id).toBe(itemB);
    expect(bo.body.backorder[0].backorder).toBe(2);

    // Over-fulfil is clamped: asking for 99 of A never exceeds the ordered 5.
    const over = await request(app).post(`/api/v1/wholesale/orders/${id}/fulfill`).set(auth(t))
      .send({ items: [{ item_id: itemA, qty: 99 }, { item_id: itemB, qty: 2 }] });
    expect(over.body.backorder_units).toBe(2); // still just B's shortfall

    // Dispatch is allowed from partially_picked.
    expect((await request(app).post(`/api/v1/wholesale/orders/${id}/dispatch`).set(auth(t)).send({ driver_name: 'Partial Van' })).status).toBe(200);
    // Deliver → bills only the fulfilled value: 5×10 + 2×10 = 70 (not the 90 ordered).
    expect((await request(app).post(`/api/v1/wholesale/orders/${id}/deliver`).set(auth(t))).status).toBe(200);

    const tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(t))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a2 => a2.code === '1100').balance).toBeCloseTo(70, 2); // receivable = shipped value
    expect(tb.accounts.find(a2 => a2.code === '4000').balance).toBeCloseTo(70, 2); // revenue = shipped value

    // Outstanding reflects the billed 70, and a payment cannot exceed it.
    const pay = await request(app).post(`/api/v1/wholesale/orders/${id}/payment`).set(auth(t)).send({ amount: 1000 });
    expect(pay.body.payment_status).toBe('paid');
    const tb2 = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(t))).body;
    expect(tb2.accounts.find(a2 => a2.code === '1100').balance).toBeCloseTo(0, 2);  // settled
    expect(tb2.accounts.find(a2 => a2.code === '1000').balance).toBeCloseTo(70, 2); // collected only 70
  });

  test('credit note / return: reverses revenue + receivable, caps at returnable', async () => {
    const t = await register();
    await enableModule(t, 'wholesale');
    const l = await location(t);
    const prod = await stockedProduct(t, l, 10, 100); // price 10
    const c = await request(app).post('/api/v1/customers').set(auth(t)).send({ name: 'Returns Shop', phone: '0700555666' });

    // Deliver a 5-unit order (bills 50), then collect nothing yet.
    const created = await request(app).post('/api/v1/wholesale/orders').set(auth(t))
      .send({ customer_id: c.body.id, items: [{ product_id: prod, quantity: 5 }] });
    const id = created.body.id;
    const itemId = created.body.items[0].id;
    await request(app).post(`/api/v1/wholesale/orders/${id}/pick`).set(auth(t)).send({ item_ids: [itemId] });
    await request(app).post(`/api/v1/wholesale/orders/${id}/dispatch`).set(auth(t)).send({ driver_name: 'Van' });
    await request(app).post(`/api/v1/wholesale/orders/${id}/deliver`).set(auth(t));

    let tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(t))).body;
    expect(tb.accounts.find(a => a.code === '1100').balance).toBeCloseTo(50, 2); // owes 50

    // Customer returns 2 units → credit note for 20.
    const cn = await request(app).post(`/api/v1/wholesale/orders/${id}/credit-note`).set(auth(t))
      .send({ reason: 'Damaged in transit', items: [{ item_id: itemId, qty: 2 }] });
    expect(cn.status).toBe(201);
    expect(Number(cn.body.totalCredit)).toBe(20);

    // GL: revenue reversed by 20, receivable down to 30, books balanced.
    tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(t))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a => a.code === '1100').balance).toBeCloseTo(30, 2);
    expect(tb.accounts.find(a => a.code === '4000').balance).toBeCloseTo(30, 2);

    // Outstanding reflects the re-stated 30.
    const out = (await request(app).get('/api/v1/wholesale/outstanding').set(auth(t))).body;
    expect(out.outstanding.find(o => o.customer === 'Returns Shop').outstanding).toBeCloseTo(30, 2);

    // Can't credit more than what's left returnable (5 fulfilled − 2 credited = 3).
    const over = await request(app).post(`/api/v1/wholesale/orders/${id}/credit-note`).set(auth(t))
      .send({ items: [{ item_id: itemId, qty: 4 }] });
    expect(over.status).toBe(400);

    // The list shows the one note and its total.
    const notes = (await request(app).get(`/api/v1/wholesale/orders/${id}/credit-notes`).set(auth(t))).body;
    expect(notes.total_credited).toBeCloseTo(20, 2);
  });
});

describe('restaurant recipes (BOM ingredient depletion)', () => {
  let token, loc;
  beforeAll(async () => { token = await register(); await enableModule(token, 'restaurant'); loc = await location(token); });

  async function menuItem(name) {
    const r = await request(app).post('/api/v1/products').set(auth(token))
      .send({ name: `${name} ${Date.now()}_${SEQ++}`, selling_price: 8, cost_price: 0 });
    expect(r.status).toBe(201);
    return r.body.id;
  }

  test('selling a recipe item depletes ingredients, not the finished good', async () => {
    const bun   = await stockedProduct(token, loc, 1, 100); // 100 buns
    const patty = await stockedProduct(token, loc, 2, 50);  // 50 patties
    const burger = await menuItem('Burger');

    const rec = await request(app).put(`/api/v1/restaurant/products/${burger}/recipe`).set(auth(token))
      .send({ yieldQty: 1, items: [{ ingredient_id: bun, quantity: 2 }, { ingredient_id: patty, quantity: 1 }] });
    expect(rec.status).toBe(200);
    expect(rec.body.items.length).toBe(2);

    const sale = await makeSale(token, loc, burger, { qty: 3, price: 8 });
    expect(sale.status).toBe(201);

    // 3 burgers → 6 buns, 3 patties consumed; the burger itself has no stock row
    const bunLevel   = await prisma.stockLevel.findFirst({ where: { productId: bun, locationId: loc } });
    const pattyLevel = await prisma.stockLevel.findFirst({ where: { productId: patty, locationId: loc } });
    expect(bunLevel.quantity).toBe(94);
    expect(pattyLevel.quantity).toBe(47);
    const burgerLevel = await prisma.stockLevel.findFirst({ where: { productId: burger, locationId: loc } });
    expect(burgerLevel).toBeFalsy();

    // ingredient movements recorded against the sale
    const mv = await prisma.stockMovement.findFirst({ where: { productId: bun, referenceType: 'recipe' } });
    expect(mv).toBeTruthy();
    expect(mv.quantity).toBe(-6);
  });

  test('insufficient ingredient stock blocks the sale', async () => {
    const cheese = await stockedProduct(token, loc, 1, 1); // only 1 cheese
    const sandwich = await menuItem('Sandwich');
    await request(app).put(`/api/v1/restaurant/products/${sandwich}/recipe`).set(auth(token))
      .send({ items: [{ ingredient_id: cheese, quantity: 2 }] });
    const sale = await makeSale(token, loc, sandwich, { qty: 1, price: 5 });
    expect(sale.status).toBe(400);
  });
});

describe('financial statements (P&L + balance sheet from the ledger)', () => {
  let token, loc;
  beforeAll(async () => { token = await register(); loc = await location(token); });

  test('P&L and balance sheet derive from the journals and balance', async () => {
    // Receive 50 units @ 12 via a PO → Dr Inventory 600 / Cr Accounts Payable 600
    const sup = (await request(app).post('/api/v1/suppliers').set(auth(token)).send({ name: 'Acme Supply', currency: 'USD' })).body;
    const prod = (await request(app).post('/api/v1/products').set(auth(token)).send({ name: `Widget ${Date.now()}`, selling_price: 20, cost_price: 12 })).body;
    const po = (await request(app).post('/api/v1/purchase-orders').set(auth(token)).send({
      supplier_id: sup.id, location_id: loc, currency: 'USD',
      items: [{ product_id: prod.id, ordered_qty: 50, unit_price: 12 }],
    })).body;
    const poItemId = po.items[0].id;
    expect((await request(app).put(`/api/v1/purchase-orders/${po.id}/status`).set(auth(token))
      .send({ status: 'received', received_items: [{ id: poItemId, product_id: prod.id, qty: 50, unit_price: 12 }] })).status).toBe(200);

    // Sell 2 @ 20 (cash) → revenue 40, COGS 24 (FIFO @ 12)
    expect((await makeSale(token, loc, prod.id, { qty: 2, price: 20 })).status).toBe(201);
    // Pay an operating expense of 10 → Dr Operating Expenses / Cr Cash
    expect((await request(app).post('/api/v1/expenses').set(auth(token)).send({ amount: 10, payment_status: 'paid' })).status).toBe(201);

    const pl = (await request(app).get('/api/v1/accounting/income-statement').set(auth(token))).body;
    expect(pl.revenue).toBeCloseTo(40, 2);
    expect(pl.cogs).toBeCloseTo(24, 2);
    expect(pl.gross_profit).toBeCloseTo(16, 2);
    expect(pl.operating_expenses).toBeCloseTo(10, 2);
    expect(pl.net_profit).toBeCloseTo(6, 2);

    const bs = (await request(app).get('/api/v1/accounting/balance-sheet').set(auth(token))).body;
    expect(bs.balanced).toBe(true);
    expect(bs.assets).toBeCloseTo(606, 2);       // cash 30 + inventory 576
    expect(bs.liabilities).toBeCloseTo(600, 2);  // accounts payable
    expect(bs.equity).toBeCloseTo(6, 2);         // retained earnings = net profit
  });
});

describe('accounting — manual journal entry + AR aging', () => {
  let token, bizId;
  beforeAll(async () => {
    token = await register();
    bizId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).businessId;
  });

  test('manual journal: balanced posts, unbalanced and unknown-code are rejected', async () => {
    // balanced adjustment: Dr Operating Expenses 15 / Cr Cash 15
    const ok = await request(app).post('/api/v1/accounting/journal').set(auth(token)).send({
      description: 'Owner reimbursement', lines: [
        { code: '5200', debit: 15, description: 'Sundry' },
        { code: '1000', credit: 15 },
      ],
    });
    expect(ok.status).toBe(201);

    // it shows up and the books stay balanced
    const tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a => a.code === '5200').balance).toBeCloseTo(15, 2);

    // unbalanced → 400
    expect((await request(app).post('/api/v1/accounting/journal').set(auth(token)).send({
      description: 'bad', lines: [{ code: '5200', debit: 10 }, { code: '1000', credit: 7 }],
    })).status).toBe(400);

    // unknown account code → 400
    expect((await request(app).post('/api/v1/accounting/journal').set(auth(token)).send({
      description: 'bad', lines: [{ code: '9999', debit: 5 }, { code: '1000', credit: 5 }],
    })).status).toBe(400);
  });

  test('AR aging buckets open charges by age, applying payments FIFO', async () => {
    const cust = (await request(app).post('/api/v1/customers').set(auth(token)).send({ name: 'Ageing Cust', phone: '0612000' })).body;
    const day = 86400000;
    const at = (d) => new Date(Date.now() - d * day);
    // two charges (100 old @ 75 days, 60 recent @ 10 days) and a 40 payment → FIFO clears
    // the oldest first: 100-40 = 60 left in 61-90, plus 60 in 0-30.
    await prisma.creditLedger.createMany({ data: [
      { businessId: bizId, customerId: cust.id, type: 'purchase', amount: 100, direction: 'debit', balanceAfter: 100, createdAt: at(75) },
      { businessId: bizId, customerId: cust.id, type: 'purchase', amount: 60, direction: 'debit', balanceAfter: 160, createdAt: at(10) },
      { businessId: bizId, customerId: cust.id, type: 'repayment', amount: 40, direction: 'credit', balanceAfter: 120, createdAt: at(5) },
    ] });

    const aging = (await request(app).get('/api/v1/accounting/aging').set(auth(token))).body;
    const row = aging.customers.find(c => c.customer_id === cust.id);
    expect(row).toBeTruthy();
    expect(row.b61_90).toBeCloseTo(60, 2);   // 100 charge − 40 payment (FIFO)
    expect(row.b0_30).toBeCloseTo(60, 2);     // recent charge untouched
    expect(row.total).toBeCloseTo(120, 2);
    expect(aging.totals.total).toBeGreaterThanOrEqual(120);
  });
});

describe('lending — underwriting from the ledger', () => {
  test('a fresh business with no activity is not eligible', async () => {
    const token = await register();
    const a = (await request(app).get('/api/v1/lending/assessment').set(auth(token))).body;
    expect(a.eligible).toBe(false);
    expect(a.recommended_limit).toBe(0);
    expect(a.signals.avg_monthly_revenue).toBe(0);
  });

  test('a trading business is pre-qualified for a limit sized to its cashflow', async () => {
    const token = await register();
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 20, 500); // sell 20, cost 5, stock 500
    expect((await makeSale(token, loc, prod, { qty: 300, price: 20 })).status).toBe(201); // 6000 revenue

    const a = (await request(app).get('/api/v1/lending/assessment').set(auth(token))).body;
    expect(a.eligible).toBe(true);
    expect(a.score).toBeGreaterThan(50);
    expect(a.signals.avg_monthly_revenue).toBeCloseTo(2000, 0);   // 6000 over a 3-month window
    expect(a.recommended_limit).toBeGreaterThan(0);
    expect(a.recommended_limit).toBeLessThanOrEqual(a.signals.avg_monthly_revenue + 0.01); // scaled by score ≤ 1
  });

  test('Sharia-compliant advance: fixed fee, disburse, auto-collect from sales, settle', async () => {
    const token = await register();
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 20, 1000); // sell 20, cost 5
    expect((await makeSale(token, loc, prod, { qty: 300, price: 20 })).status).toBe(201); // qualify (6000)

    // Offer 1000 over 30 days, auto-collect 50% of takings
    const offer = await request(app).post('/api/v1/lending/offer').set(auth(token))
      .send({ principal: 1000, term_days: 30, collection_rate: 0.5 });
    expect(offer.status).toBe(201);
    // Fixed disclosed fee (6% flat) — NOT interest
    expect(Number(offer.body.feeAmount)).toBeCloseTo(60, 2);
    expect(Number(offer.body.totalRepayable)).toBeCloseTo(1060, 2);

    // Over-limit offers are refused by underwriting
    expect((await request(app).post('/api/v1/lending/offer').set(auth(token)).send({ principal: 999999 })).status).toBe(400);

    // Disburse → financing payable appears on the books (KYC must clear first)
    await passKyc(token);
    expect((await request(app).post(`/api/v1/lending/advances/${offer.body.id}/disburse`).set(auth(token))).status).toBe(200);
    let tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a => a.code === '2200').balance).toBeCloseTo(1060, 2); // owes principal + fee

    // A 400 cash sale auto-collects 50% = 200 toward the advance
    expect((await makeSale(token, loc, prod, { qty: 20, price: 20 })).status).toBe(201);
    let adv = (await request(app).get('/api/v1/lending/advances').set(auth(token))).body.advances[0];
    expect(Number(adv.amountRepaid)).toBeCloseTo(200, 2);
    expect(adv.outstanding).toBeCloseTo(860, 2);

    // Manual repayment of the remaining 860 settles it
    const repay = await request(app).post(`/api/v1/lending/advances/${offer.body.id}/repay`).set(auth(token)).send({ amount: 860 });
    expect(repay.status).toBe(200);
    expect(repay.body.settled).toBe(true);
    adv = (await request(app).get('/api/v1/lending/advances').set(auth(token))).body.advances[0];
    expect(adv.status).toBe('settled');

    // Books still balance after the whole financing lifecycle
    tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a => a.code === '2200')?.balance || 0).toBeCloseTo(0, 2); // fully repaid
  });

  test('auto-collection credits the mobile-money account; health reports progress', async () => {
    const token = await register();
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 20, 1000);
    expect((await makeSale(token, loc, prod, { qty: 300, price: 20 })).status).toBe(201); // qualify

    const offer = (await request(app).post('/api/v1/lending/offer').set(auth(token)).send({ principal: 1000, collection_rate: 0.5 })).body;
    await passKyc(token);
    expect((await request(app).post(`/api/v1/lending/advances/${offer.id}/disburse`).set(auth(token))).status).toBe(200);

    // A mobile-money (Zaad) sale of 400 → auto-collect 200, credited to Mobile Money (1010), not Cash
    const ik = (await request(app).post('/api/v1/sales/initiate').set(auth(token))).body.idempotency_key;
    const sale = await request(app).post('/api/v1/sales').set(auth(token)).send({
      idempotency_key: ik, items: [{ product_id: prod, quantity: 20, override_price: 20 }],
      location_id: loc, payment_method: 'zaad',
    });
    expect(sale.status).toBe(201);

    const repayJournal = await prisma.journalEntry.findFirst({
      where: { sourceType: 'financing_repayment', businessId: sale.body.businessId },
      include: { lines: { include: { account: true } } }, orderBy: { createdAt: 'desc' },
    });
    const by = {};
    for (const l of repayJournal.lines) by[l.account.code] = l;
    expect(parseFloat(by['1010'].credit)).toBeCloseTo(200, 2); // Mobile Money, not Cash
    expect(parseFloat(by['2200'].debit)).toBeCloseTo(200, 2);

    // Health endpoint reports repayment progress + a current re-score
    const h = (await request(app).get(`/api/v1/lending/advances/${offer.id}/health`).set(auth(token))).body;
    expect(h.outstanding).toBeCloseTo(860, 2);
    expect(['on_track', 'behind', 'at_risk', 'overdue', 'settled']).toContain(h.repayment_status);
    expect(typeof h.current_score).toBe('number');
  });

  test('KYC gate: no disbursement without verified, non-blacklisted identity', async () => {
    const token = await register();
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 20, 1000);
    await makeSale(token, loc, prod, { qty: 300, price: 20 }); // qualify
    const offer = (await request(app).post('/api/v1/lending/offer').set(auth(token)).send({ principal: 1000 })).body;

    // No KYC on file → blocked (422 KYC_REQUIRED)
    let r = await request(app).post(`/api/v1/lending/advances/${offer.id}/disburse`).set(auth(token));
    expect(r.status).toBe(422);

    // Captured but not yet verified → still blocked
    const idNo = `ID-GATE-${Date.now()}`;
    await request(app).put('/api/v1/lending/kyc').set(auth(token)).send({ legal_name: 'Aisha', id_type: 'national_id', id_number: idNo });
    r = await request(app).post(`/api/v1/lending/advances/${offer.id}/disburse`).set(auth(token));
    expect(r.status).toBe(422);

    // Blacklist this identity, then verify → disbursement refused (403 BLACKLISTED)
    expect((await request(app).post('/api/v1/lending/blacklist').set(auth(token)).send({ id_number: idNo, reason: 'Known fraud' })).status).toBe(201);
    await request(app).post('/api/v1/lending/kyc/decision').set(auth(token)).send({ decision: 'verified' });
    r = await request(app).post(`/api/v1/lending/advances/${offer.id}/disburse`).set(auth(token));
    expect(r.status).toBe(403);
  });

  test('Sharia late handling: restructure never grows debt; charity fee books to charity, not income', async () => {
    const token = await register();
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 20, 1000);
    await makeSale(token, loc, prod, { qty: 300, price: 20 }); // qualify
    await passKyc(token);
    const offer = (await request(app).post('/api/v1/lending/offer').set(auth(token)).send({ principal: 1000, term_days: 30 })).body;
    expect((await request(app).post(`/api/v1/lending/advances/${offer.id}/disburse`).set(auth(token))).status).toBe(200);

    // Restructure: extend the term, change the collection share — debt unchanged.
    const before = (await request(app).get('/api/v1/lending/advances').set(auth(token))).body.advances[0];
    const rs = await request(app).post(`/api/v1/lending/advances/${offer.id}/restructure`).set(auth(token)).send({ term_days: 60, collection_rate: 0.2 });
    expect(rs.status).toBe(200);
    expect(rs.body.restructureCount).toBe(1);
    expect(rs.body.termDays).toBe(60);
    expect(Number(rs.body.totalRepayable)).toBeCloseTo(Number(before.totalRepayable), 2); // riba-free: debt never grew

    // Charity late charge: Dr Charity/Late-Fee (5400) / Cr Charity Payable (2300).
    const cf = await request(app).post(`/api/v1/lending/advances/${offer.id}/charity-fee`).set(auth(token)).send({ amount: 25 });
    expect(cf.status).toBe(200);
    expect(Number(cf.body.charityCommitted)).toBeCloseTo(25, 2);

    const tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
    expect(tb.accounts.find(a => a.code === '2300').balance).toBeCloseTo(25, 2); // charity payable
    expect(tb.accounts.find(a => a.code === '5400').balance).toBeCloseTo(25, 2); // charity expense
    // The loan balance (2200) is unchanged by the charity charge — not income, not interest.
    expect(tb.accounts.find(a => a.code === '2200').balance).toBeCloseTo(Number(before.totalRepayable), 2);
  });

  test('default flags the advance and blocks future financing (credit history)', async () => {
    const token = await register();
    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 20, 1000);
    await makeSale(token, loc, prod, { qty: 300, price: 20 });
    await passKyc(token);
    const offer = (await request(app).post('/api/v1/lending/offer').set(auth(token)).send({ principal: 1000 })).body;
    expect((await request(app).post(`/api/v1/lending/advances/${offer.id}/disburse`).set(auth(token))).status).toBe(200);

    // Mark it defaulted — the payable stays on the books (debt isn't forgiven).
    const d = await request(app).post(`/api/v1/lending/advances/${offer.id}/default`).set(auth(token));
    expect(d.status).toBe(200);
    expect(d.body.status).toBe('defaulted');

    // A new offer can be made, but disbursement is blocked by the prior default.
    const offer2 = (await request(app).post('/api/v1/lending/offer').set(auth(token)).send({ principal: 500 })).body;
    const r = await request(app).post(`/api/v1/lending/advances/${offer2.id}/disburse`).set(auth(token));
    expect(r.status).toBe(403);
  });
});

describe('hotel — best available rate (seasonal + long-stay)', () => {
  let token, rtId, roomId;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'hotel');
    const rt = await request(app).post('/api/v1/hotel/room-types').set(auth(token)).send({ name: 'Deluxe', baseRate: 100, maxOccupancy: 2 });
    rtId = rt.body.id;
    const room = await request(app).post('/api/v1/hotel/rooms').set(auth(token)).send({ roomTypeId: rtId, number: '101' });
    roomId = room.body.id;
    // Seasonal plan (December): 80/night. Long-stay plan: 60/night, 7+ nights.
    await request(app).post('/api/v1/hotel/rate-plans').set(auth(token)).send({ roomTypeId: rtId, name: 'December Special', ratePerNight: 80, validFrom: '2026-12-01', validUntil: '2026-12-31' });
    await request(app).post('/api/v1/hotel/rate-plans').set(auth(token)).send({ roomTypeId: rtId, name: 'Long Stay 7+', ratePerNight: 60, minNights: 7 });
  });

  test('quote picks the cheapest qualifying plan; falls back to base rate', async () => {
    // 2 nights in December → seasonal 80 wins (long-stay needs 7 nights)
    const q1 = (await request(app).get('/api/v1/hotel/quote').set(auth(token)).query({ room_type_id: rtId, check_in: '2026-12-10', check_out: '2026-12-12' })).body;
    expect(q1.rate).toBeCloseTo(80, 2);
    expect(q1.nights).toBe(2);
    expect(q1.total).toBeCloseTo(160, 2);
    expect(q1.plan.name).toBe('December Special');

    // 7 nights in December → long-stay 60 is cheaper and now qualifies
    const q2 = (await request(app).get('/api/v1/hotel/quote').set(auth(token)).query({ room_type_id: rtId, check_in: '2026-12-10', check_out: '2026-12-17' })).body;
    expect(q2.rate).toBeCloseTo(60, 2);
    expect(q2.total).toBeCloseTo(420, 2);

    // 2 nights in November → no plan qualifies → room-type base rate 100
    const q3 = (await request(app).get('/api/v1/hotel/quote').set(auth(token)).query({ room_type_id: rtId, check_in: '2026-11-10', check_out: '2026-11-12' })).body;
    expect(q3.rate).toBeCloseTo(100, 2);
    expect(q3.source).toBe('base_rate');
  });

  test('reservation with no rate specified auto-applies the best seasonal rate', async () => {
    const r = await request(app).post('/api/v1/hotel/reservations').set(auth(token)).send({
      roomId, guestName: 'Mr Yusuf', checkInDate: '2026-12-10', checkOutDate: '2026-12-12',
    });
    expect(r.status).toBe(201);
    expect(Number(r.body.ratePerNight)).toBeCloseTo(80, 2);  // seasonal rate applied
    expect(Number(r.body.totalRoomCharge)).toBeCloseTo(160, 2);
    expect(r.body.ratePlanId).toBeTruthy();                  // the plan that was applied
  });
});

describe('pharmacy prescriptions & controlled substances', () => {
  let token, loc, drug, verifierId;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'pharmacy');
    loc = await location(token);
    drug = await stockedProduct(token, loc, 5, 100); // 100 units in stock
    await prisma.product.update({ where: { id: drug }, data: { isPrescriptionDrug: true, controlledSchedule: 'C-II' } });
    const v = await request(app).post('/api/v1/users').set(auth(token))
      .send({ name: 'Verifier', email: `verifier_${Date.now()}_${SEQ++}@balanzify.test`, password: 'SecurePass123!', role: 'manager' });
    expect(v.status).toBe(201);
    verifierId = v.body.id;
  });

  test('Rx lifecycle: controlled dispense needs a 2nd person; refills are enforced', async () => {
    const rx = (await request(app).post('/api/v1/pharmacy/prescriptions').set(auth(token)).send({
      product_id: drug, patient_name: 'Yusuf', prescriber_name: 'Dr Ali', prescriber_reg: 'MD-123',
      quantity: 20, refills_authorized: 1, sig: '1 tablet daily',
    })).body;
    expect(rx.rxNumber).toBeTruthy();
    expect(rx.refills_remaining).toBe(2); // original fill + 1 refill

    // controlled substance: dispensing without a verifier is rejected
    expect((await request(app).post(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`).set(auth(token)).send({ location_id: loc })).status).toBe(400);

    // first dispense (verified) → stock 100→80, one fill used
    const d1 = await request(app).post(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`).set(auth(token)).send({ location_id: loc, verified_by: verifierId });
    expect(d1.status).toBe(201);
    expect(d1.body.refills_remaining).toBe(1);
    expect((await prisma.stockLevel.findFirst({ where: { productId: drug, locationId: loc } })).quantity).toBe(80);

    // refill dispense → completed, none left
    const d2 = await request(app).post(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`).set(auth(token)).send({ location_id: loc, verified_by: verifierId });
    expect(d2.status).toBe(201);
    expect(d2.body.refills_remaining).toBe(0);

    // third dispense → blocked (no refills)
    expect((await request(app).post(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`).set(auth(token)).send({ location_id: loc, verified_by: verifierId })).status).toBe(400);

    // controlled-substance register shows both dispenses
    const reg = await request(app).get('/api/v1/pharmacy/controlled-register').set(auth(token));
    expect(reg.status).toBe(200);
    expect(reg.body.register.filter(r => r.rx_number === rx.rxNumber).length).toBe(2);
  });
});

describe('pharmacy drug-interaction checking (clinical safety)', () => {
  let token, loc;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'pharmacy');
    loc = await location(token);
  });
  async function drug(generic) {
    const id = await stockedProduct(token, loc, 5, 100);
    await prisma.product.update({ where: { id }, data: { genericName: generic, isPrescriptionDrug: true } });
    return id;
  }

  test('ad-hoc check flags a major interaction from the shipped KB', async () => {
    const r = await request(app).post('/api/v1/pharmacy/interactions/check').set(auth(token))
      .send({ drugs: ['warfarin', 'Aspirin 100mg'] }); // brand/strength still matches the generic
    expect(r.status).toBe(200);
    expect(r.body.interactions.length).toBeGreaterThan(0);
    expect(r.body.interactions[0].severity).toBe('major');
    expect(r.body.has_contraindication).toBe(false);
  });

  test('check by product ids detects a contraindication', async () => {
    const clari = await drug('clarithromycin');
    const simva = await drug('simvastatin');
    const r = await request(app).post('/api/v1/pharmacy/interactions/check').set(auth(token))
      .send({ product_ids: [clari, simva] });
    expect(r.body.has_contraindication).toBe(true);
    expect(r.body.interactions[0].severity).toBe('contraindicated');
  });

  test('dispense is blocked by a contraindication with the patient\'s active meds, unless overridden', async () => {
    const simva = await drug('simvastatin');
    const clari = await drug('clarithromycin');
    // patient is already on simvastatin (an active prescription = their med list)
    await request(app).post('/api/v1/pharmacy/prescriptions').set(auth(token)).send({
      product_id: simva, patient_name: 'Khadija', prescriber_name: 'Dr Nur', quantity: 30,
    });
    // now a clarithromycin script for the same patient
    const rx = (await request(app).post('/api/v1/pharmacy/prescriptions').set(auth(token)).send({
      product_id: clari, patient_name: 'Khadija', prescriber_name: 'Dr Nur', quantity: 14,
    })).body;

    // dispensing it is blocked — contraindicated with the patient's simvastatin
    const blocked = await request(app).post(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`).set(auth(token)).send({ location_id: loc });
    expect(blocked.status).toBe(409);
    expect(blocked.body.interactions[0].severity).toBe('contraindicated');

    // an explicit override proceeds, surfacing the warning on the record
    const ok = await request(app).post(`/api/v1/pharmacy/prescriptions/${rx.id}/dispense`).set(auth(token)).send({ location_id: loc, override: true });
    expect(ok.status).toBe(201);
    expect(ok.body.interactions.length).toBeGreaterThan(0);
  });

  test('a business can add its own interaction rule', async () => {
    const add = await request(app).post('/api/v1/pharmacy/interactions').set(auth(token))
      .send({ drug_a: 'localdrugx', drug_b: 'localdrugy', severity: 'major', description: 'House formulary rule.' });
    expect(add.status).toBe(201);
    const r = await request(app).post('/api/v1/pharmacy/interactions/check').set(auth(token))
      .send({ drugs: ['LocalDrugX', 'localdrugy 50mg'] });
    expect(r.body.interactions.find(i => i.severity === 'major')).toBeTruthy();
  });

  test('dispensing label: structured payload + printable text with warnings', async () => {
    const d = await drug('amoxicillin');
    const rx = (await request(app).post('/api/v1/pharmacy/prescriptions').set(auth(token)).send({
      product_id: d, patient_name: 'Liban', prescriber_name: 'Dr Aw', quantity: 21, sig: '1 capsule three times daily',
    })).body;
    const label = await request(app).get(`/api/v1/pharmacy/prescriptions/${rx.id}/label`).set(auth(token));
    expect(label.status).toBe(200);
    expect(label.body.patient.name).toBe('Liban');
    expect(label.body.directions).toBe('1 capsule three times daily');
    expect(label.body.quantity).toBe(21);
    expect(label.body.warnings.length).toBeGreaterThan(0);
    expect(label.body.label_text).toContain('Rx:');
    expect(label.body.label_text).toContain('Liban');
  });
});

describe('restaurant checkout (in-process sale service — no HTTP self-call)', () => {
  let token, loc, prod;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'restaurant');
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 100);
    // configure a 10% service charge for this business
    const { businessId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    await prisma.business.update({ where: { id: businessId }, data: { serviceChargePct: 10 } });
  });

  test('order → add item → checkout: real sale, service charge applied, order completed', async () => {
    const order = (await request(app).post('/api/v1/restaurant/orders').set(auth(token)).send({ type: 'takeaway' })).body;
    expect(order.id).toBeTruthy();
    expect((await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prod, quantity: 2 })).status).toBe(201);

    const checkout = await request(app).post(`/api/v1/restaurant/orders/${order.id}/checkout`).set(auth(token))
      .send({ payment_method: 'cash', cash_tendered: 100 });
    expect(checkout.status).toBe(200);
    expect(checkout.body.sale.id).toBeTruthy();
    // 2 x 10 = 20 subtotal; 10% service charge = 2; total 22
    expect(Number(checkout.body.sale.serviceCharge)).toBeCloseTo(2, 2);
    expect(Number(checkout.body.sale.totalAmount)).toBeCloseTo(22, 2);

    const ord = await prisma.restaurantOrder.findUnique({ where: { id: order.id } });
    expect(ord.status).toBe('completed');
    expect(ord.saleId).toBe(checkout.body.sale.id);
    // the sale decremented stock (2 of 100) — proving it ran the real sale transaction
    expect((await prisma.stockLevel.findFirst({ where: { productId: prod, locationId: loc } })).quantity).toBe(98);
  });
});

describe('restaurant: seat-level ordering + split bill by seat', () => {
  let token, loc, prodA, prodB;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'restaurant');
    loc = await location(token);
    prodA = await stockedProduct(token, loc, 10, 100); // 10 each
    prodB = await stockedProduct(token, loc, 6, 100);  // 6 each
  });

  test('items carry a seat number and the bill splits one per seat', async () => {
    const order = (await request(app).post('/api/v1/restaurant/orders').set(auth(token)).send({ type: 'dine_in' })).body;
    // Seat 1 had 2× prodA (20); seat 2 had 1× prodB (6); one shared item prodB (6).
    expect((await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prodA, quantity: 2, seat: 1 })).status).toBe(201);
    const s2 = await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prodB, quantity: 1, seat: 2 });
    expect(s2.status).toBe(201);
    expect(s2.body.seat).toBe(2);
    await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prodB, quantity: 1 }); // shared, no seat

    const split = await request(app).post(`/api/v1/restaurant/orders/${order.id}/split-by-seat`).set(auth(token));
    expect(split.status).toBe(201);
    expect(split.body.new_orders).toHaveLength(3); // seat 1, seat 2, shared
    const seat1 = split.body.new_orders.find(o => o.label === 'Seat 1');
    const seat2 = split.body.new_orders.find(o => o.label === 'Seat 2');
    const shared = split.body.new_orders.find(o => o.label === 'Shared');
    expect(Number(seat1.total)).toBeCloseTo(20, 2);
    expect(Number(seat2.total)).toBeCloseTo(6, 2);
    expect(Number(shared.total)).toBeCloseTo(6, 2);

    // Original order is voided after the split.
    const orig = await prisma.restaurantOrder.findUnique({ where: { id: order.id } });
    expect(orig.status).toBe('void');
  });

  test('split-by-seat needs at least two buckets', async () => {
    const order = (await request(app).post('/api/v1/restaurant/orders').set(auth(token)).send({ type: 'dine_in' })).body;
    await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prodA, quantity: 1, seat: 1 });
    const split = await request(app).post(`/api/v1/restaurant/orders/${order.id}/split-by-seat`).set(auth(token));
    expect(split.status).toBe(400);
    expect(split.body.code).toBe('NEEDS_SEATS');
  });

  test('coffee-shop quick start scaffolds modifiers + menu + combo, and prices a custom drink', async () => {
    const t = await register();
    await enableModule(t, 'restaurant');

    const preset = await request(app).post('/api/v1/restaurant/presets/coffeeshop').set(auth(t));
    expect(preset.status).toBe(201);
    expect(preset.body.groups_created).toBe(4);          // Size, Milk, Temperature, Extras
    expect(preset.body.products_created).toBe(10);       // 8 drinks + 2 pastries
    expect(preset.body.modifiers_attached).toBe(32);     // 8 drinks × 4 groups
    expect(preset.body.combo_created).toBe(true);

    // Re-running is idempotent — nothing duplicated.
    const again = await request(app).post('/api/v1/restaurant/presets/coffeeshop').set(auth(t));
    expect(again.body.groups_created).toBe(0);
    expect(again.body.products_created).toBe(0);
    expect(again.body.reused).toBe(true);

    // The Milk group carries Oat Milk (+0.50); the Size group carries Large (+1.00).
    const groups = (await request(app).get('/api/v1/restaurant/modifiers').set(auth(t))).body.modifier_groups;
    const milkGroup = groups.find(g => g.name === 'Milk');
    expect(milkGroup).toBeTruthy();
    const oat = milkGroup.options.find(o => o.name === 'Oat Milk');
    expect(Number(oat.priceAdjustment)).toBeCloseTo(0.50, 2);
    const large = groups.find(g => g.name === 'Size').options.find(o => o.name === 'Large');

    // Find the Latte and confirm its four modifier groups are wired on.
    const latte = (await request(app).get('/api/v1/products').set(auth(t))).body.products.find(p => p.name === 'Latte');
    const attached = (await request(app).get(`/api/v1/restaurant/products/${latte.id}/modifiers`).set(auth(t))).body.modifier_groups;
    expect(attached).toHaveLength(4);

    // Ring a Large Oat-milk Latte: 3.00 base + 1.00 (large) + 0.50 (oat) = 4.50.
    const order = (await request(app).post('/api/v1/restaurant/orders').set(auth(t)).send({ type: 'takeaway' })).body;
    const add = await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(t))
      .send({ productId: latte.id, quantity: 1, modifiers: [{ optionId: large.id }, { optionId: oat.id }] });
    expect(add.status).toBe(201);
    expect(Number(add.body.lineTotal)).toBeCloseTo(4.50, 2);
  });

  test('combo / set menu expands into apportioned component lines summing to the deal price', async () => {
    // A & B normally 10 + 6 = 16; sell the combo for 12.
    const combo = await request(app).post('/api/v1/restaurant/combos').set(auth(token)).send({
      name: 'Lunch Deal', price: 12, items: [{ product_id: prodA, quantity: 1 }, { product_id: prodB, quantity: 1 }],
    });
    expect(combo.status).toBe(201);

    const order = (await request(app).post('/api/v1/restaurant/orders').set(auth(token)).send({ type: 'dine_in' })).body;
    const add = await request(app).post(`/api/v1/restaurant/orders/${order.id}/combo`).set(auth(token)).send({ comboId: combo.body.id, quantity: 1 });
    expect(add.status).toBe(201);
    expect(Number(add.body.deal_total)).toBeCloseTo(12, 2);
    // Two component lines, each fires to the kitchen, summing exactly to 12.
    expect(add.body.items).toHaveLength(2);
    const lineSum = add.body.items.reduce((s, i) => s + Number(i.lineTotal), 0);
    expect(lineSum).toBeCloseTo(12, 2);

    // Order total reflects the deal price, not 16.
    const ord = await prisma.restaurantOrder.findUnique({ where: { id: order.id } });
    expect(Number(ord.totalAmount)).toBeCloseTo(12, 2);
  });
});

describe('restaurant: waiter / 86 / reservations as proper records', () => {
  let token, loc, prod, tableId, waiterId;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'restaurant');
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 100);
    tableId = (await request(app).post('/api/v1/restaurant/tables').set(auth(token)).send({ number: 'T1', name: 'Window', capacity: 4 })).body.id;
    waiterId = (await request(app).post('/api/v1/users').set(auth(token)).send({ name: 'Server', email: `srv_${Date.now()}_${SEQ++}@balanzify.test`, password: 'SecurePass123!', role: 'cashier' })).body.id;
  });

  test('waiter is a real FK, not a clobbered table name', async () => {
    expect((await request(app).put(`/api/v1/restaurant/tables/${tableId}/waiter`).set(auth(token)).send({ waiter_id: waiterId })).status).toBe(200);
    const t = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    expect(t.waiterId).toBe(waiterId);
    expect(t.name).toBe('Window'); // name untouched
  });

  test('86 marks an item unavailable for the day and blocks ordering', async () => {
    // 86 the item
    expect((await request(app).post(`/api/v1/restaurant/products/${prod}/86`).set(auth(token)).send({ available: false, reason: 'sold out' })).status).toBe(200);
    // product is NOT globally deactivated
    expect((await prisma.product.findUnique({ where: { id: prod } })).isActive).toBe(true);
    // it shows in the 86 list
    expect((await request(app).get('/api/v1/restaurant/eighty-six').set(auth(token))).body.items.find(i => i.product_id === prod)).toBeTruthy();
    // ordering it is blocked
    const order = (await request(app).post('/api/v1/restaurant/orders').set(auth(token)).send({ type: 'takeaway' })).body;
    expect((await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prod, quantity: 1 })).status).toBe(400);
    // un-86 → can order again
    expect((await request(app).post(`/api/v1/restaurant/products/${prod}/86`).set(auth(token)).send({ available: true })).status).toBe(200);
    expect((await request(app).post(`/api/v1/restaurant/orders/${order.id}/items`).set(auth(token)).send({ productId: prod, quantity: 1 })).status).toBe(201);
  });

  test('a reservation is a real record, not a clobbered table name', async () => {
    const r = await request(app).post('/api/v1/restaurant/table-reservations').set(auth(token))
      .send({ table_id: tableId, guest_name: 'Hodan', guest_phone: '0700123', date: '2026-09-01', time: '19:30', covers: 4 });
    expect(r.status).toBe(201);
    expect(r.body.reservation_id).toBeTruthy();
    const t = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    expect(t.name).toBe('Window'); // name NOT clobbered with BOOKED:...
    const list = await request(app).get('/api/v1/restaurant/table-reservations').set(auth(token)).query({ date: '2026-09-01' });
    expect(list.body.reservations.find(x => x.id === r.body.reservation_id)).toBeTruthy();
  });
});

describe('offline-first sync (push outbox + delta pull)', () => {
  let token, loc, prod;
  beforeAll(async () => {
    token = await register();
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 100);
    await request(app).post('/api/v1/sales/shifts/open').set(auth(token)).send({ location_id: loc, opening_float: 100 });
  });

  const saleOp = (opId, key, qty) => ({
    op_id: opId, type: 'sale', idempotency_key: key,
    payload: { items: [{ product_id: prod, quantity: qty, override_price: 10 }], location_id: loc, payment_method: 'cash', cash_tendered: qty * 10 },
  });

  test('push replays an offline outbox with client-minted keys: applied, then duplicate on re-push', async () => {
    const device = 'till-' + Date.now();
    const k1 = 'offline-' + Date.now() + '-a';
    const res = await request(app).post('/api/v1/sync/push').set(auth(token))
      .send({ device_id: device, operations: [saleOp('op1', k1, 2)] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(1);
    expect(res.body.results[0].status).toBe('applied');
    const saleId = res.body.results[0].sale_id;
    expect(saleId).toBeTruthy();

    // The device retried the same op before it knew the first push landed.
    const again = await request(app).post('/api/v1/sync/push').set(auth(token))
      .send({ device_id: device, operations: [saleOp('op1', k1, 2)] });
    expect(again.body.results[0].status).toBe('duplicate');
    expect(again.body.results[0].sale_id).toBe(saleId);
    expect(again.body.applied).toBe(0);

    // Stock moved exactly once — exactly-once semantics across the retry.
    const sl = await prisma.stockLevel.findFirst({ where: { productId: prod, locationId: loc } });
    expect(sl.quantity).toBe(98);

    // The device cursor advanced.
    const dev = (await request(app).get('/api/v1/sync/devices').set(auth(token))).body.devices.find(d => d.device_id === device);
    expect(dev).toBeTruthy();
    expect(dev.last_push_at).toBeTruthy();
  });

  test('same key + different cart is a conflict; one bad op never fails the batch', async () => {
    const device = 'till-' + Date.now() + '-b';
    const k = 'offline-' + Date.now() + '-c';
    await request(app).post('/api/v1/sync/push').set(auth(token)).send({ device_id: device, operations: [saleOp('a', k, 1)] });

    // Reuse k with a different quantity (conflict) alongside a fresh valid op.
    const k2 = 'offline-' + Date.now() + '-d';
    const res = await request(app).post('/api/v1/sync/push').set(auth(token))
      .send({ device_id: device, operations: [saleOp('a', k, 5), saleOp('b', k2, 1)] });
    expect(res.status).toBe(200);
    const byOp = Object.fromEntries(res.body.results.map(r => [r.op_id, r]));
    expect(byOp.a.status).toBe('conflict');
    expect(byOp.b.status).toBe('applied');
  });

  test('pull: full snapshot then delta by `since`', async () => {
    const full = await request(app).get('/api/v1/sync/pull').set(auth(token)).query({ device_id: 'till-pull' });
    expect(full.status).toBe(200);
    expect(full.body.full_snapshot).toBe(true);
    const mine = full.body.products.find(p => p.id === prod);
    expect(mine).toBeTruthy();
    expect(Array.isArray(mine.stock)).toBe(true);
    const cursor = full.body.server_time;

    // Nothing changed since the cursor → empty delta.
    const empty = await request(app).get('/api/v1/sync/pull').set(auth(token)).query({ since: cursor });
    expect(empty.body.full_snapshot).toBe(false);
    expect(empty.body.products.length).toBe(0);

    // Touch the product → it appears in the next delta.
    await new Promise(r => setTimeout(r, 10));
    await request(app).put(`/api/v1/products/${prod}`).set(auth(token)).send({ selling_price: 12 });
    const delta = await request(app).get('/api/v1/sync/pull').set(auth(token)).query({ since: cursor });
    expect(delta.body.products.find(p => p.id === prod)).toBeTruthy();
  });
});

describe('WhatsApp-native delivery (provider registry + journeys)', () => {
  let token;
  beforeAll(async () => { token = await register(); });

  test('send routes through the provider registry and is tracked in the log', async () => {
    const res = await request(app).post('/api/v1/whatsapp/send').set(auth(token))
      .send({ to: '063 4567890', message: 'Hello from the shop' });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('link');          // zero-config fallback
    expect(res.body.status).toBe('link');
    expect(res.body.wa_url).toContain('wa.me/252634567890'); // 0 → +252 normalization
    expect(res.body.wa_url).toContain(encodeURIComponent('Hello from the shop'));

    const log = await request(app).get('/api/v1/whatsapp/log').set(auth(token));
    expect(log.body.messages[0].phone).toBe('252634567890');
    expect(log.body.messages[0].status).toBe('link');
    expect(log.body.messages[0].provider).toBe('link');
  });

  test('credit reminder journey nudges every customer carrying a balance', async () => {
    // one customer owes money, one is settled
    const owing = await request(app).post('/api/v1/customers').set(auth(token))
      .send({ name: 'Faadumo', phone: '0612223344' });
    const settled = await request(app).post('/api/v1/customers').set(auth(token))
      .send({ name: 'Cali', phone: '0615556677' });
    await prisma.customer.update({ where: { id: owing.body.id }, data: { outstandingBalance: 125.5 } });

    const res = await request(app).post('/api/v1/whatsapp/reminders/credit').set(auth(token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.reminded).toBe(1);                 // only the one with a balance
    expect(res.body.sent).toBe(1);
    expect(res.body.results[0].name).toBe('Faadumo');
    expect(res.body.results[0].wa_url).toContain(encodeURIComponent('125.50'));

    // the settled customer was never messaged
    const log = await request(app).get('/api/v1/whatsapp/log').set(auth(token)).query({ kind: 'credit_reminder' });
    expect(log.body.messages.every(m => m.phone !== '252615556677')).toBe(true);
    expect(settled.status).toBe(201);
  });

  test('a customer opted out of WhatsApp is skipped', async () => {
    const optOut = await request(app).post('/api/v1/customers').set(auth(token))
      .send({ name: 'Xasan', phone: '0619998877' });
    await prisma.customer.update({ where: { id: optOut.body.id }, data: { outstandingBalance: 50, whatsappOptedIn: false } });
    const res = await request(app).post('/api/v1/whatsapp/reminders/credit').set(auth(token)).send({ customer_id: optOut.body.id });
    expect(res.body.reminded).toBe(0);
  });
});

describe('fiscalization (tax-authority compliance: eTIMS / VFD / EBM)', () => {
  let token, loc, prod;
  beforeAll(async () => {
    token = await register();
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 100);
  });

  test('disabled by default: fiscalize is rejected and sales are unsigned', async () => {
    const sale = await makeSale(token, loc, prod, { qty: 1, price: 10 });
    expect(sale.status).toBe(201);
    expect(sale.body._fiscal).toBeUndefined();
    const r = await request(app).post(`/api/v1/fiscal/sales/${sale.body.id}/fiscalize`).set(auth(token));
    expect(r.status).toBe(409);
  });

  test('configured device auto-signs each sale into a chained, verifiable receipt', async () => {
    const cfg = await request(app).post('/api/v1/fiscal/config').set(auth(token))
      .send({ jurisdiction: 'etims', device_serial: 'CU-0001' });
    expect(cfg.status).toBe(201);
    expect(cfg.body.enabled).toBe(true);

    const s1 = await makeSale(token, loc, prod, { qty: 2, price: 10 });
    const s2 = await makeSale(token, loc, prod, { qty: 1, price: 10 });
    // auto-fiscalized inline at checkout
    expect(s1.body._fiscal.invoice_label).toMatch(/^KRA-CU-0001-\d{7}$/);
    expect(s1.body._fiscal.qr_data).toContain('itax.kra.go.ke');

    const r1 = (await request(app).get(`/api/v1/fiscal/receipt/${s1.body.id}`).set(auth(token))).body;
    const r2 = (await request(app).get(`/api/v1/fiscal/receipt/${s2.body.id}`).set(auth(token))).body;
    // sequential numbers, and the chain links s2.prev → s1.signature
    expect(r2.fiscal_number).toBe(r1.fiscal_number + 1);

    // public QR verification recomputes the signature → authentic
    const v = await request(app).get(`/fiscal/verify/${r1.verification_code}`);
    expect(v.status).toBe(200);
    expect(v.body.valid).toBe(true);
    expect(v.body.total).toBeCloseTo(20, 2);
    expect(v.body.invoice_label).toBe(r1.invoice_label);
  });

  test('idempotent: re-fiscalizing a sale returns the same receipt', async () => {
    const s = await makeSale(token, loc, prod, { qty: 1, price: 10 });
    const first = (await request(app).get(`/api/v1/fiscal/receipt/${s.body.id}`).set(auth(token))).body;
    const again = await request(app).post(`/api/v1/fiscal/sales/${s.body.id}/fiscalize`).set(auth(token));
    expect(again.status).toBe(201);
    expect(again.body.fiscal_number).toBe(first.fiscal_number);
    expect(again.body.verification_code).toBe(first.verification_code);
  });

  test('tamper-evident: altering the sale total breaks verification', async () => {
    const s = await makeSale(token, loc, prod, { qty: 1, price: 10 });
    const r = (await request(app).get(`/api/v1/fiscal/receipt/${s.body.id}`).set(auth(token))).body;
    expect((await request(app).get(`/fiscal/verify/${r.verification_code}`)).body.valid).toBe(true);
    // someone edits the books after the fact
    await prisma.sale.update({ where: { id: s.body.id }, data: { totalAmount: 999.99 } });
    const v = await request(app).get(`/fiscal/verify/${r.verification_code}`);
    expect(v.body.valid).toBe(false);
  });

  test('transmit moves a signed receipt out of the pending queue', async () => {
    const s = await makeSale(token, loc, prod, { qty: 1, price: 10 });
    const before = (await request(app).get('/api/v1/fiscal/pending').set(auth(token))).body;
    expect(before.receipts.find(x => x.sale_id === s.body.id)).toBeTruthy();
    const t = await request(app).post(`/api/v1/fiscal/sales/${s.body.id}/transmit`).set(auth(token));
    expect(t.body.status).toBe('transmitted');
    const after = (await request(app).get('/api/v1/fiscal/pending').set(auth(token))).body;
    expect(after.receipts.find(x => x.sale_id === s.body.id)).toBeFalsy();
  });
});

describe('Islamic markets — Hijri calendar, Zakat, localization', () => {
  let token, loc, prod;
  beforeAll(async () => {
    token = await register();
    loc = await location(token);
    prod = await stockedProduct(token, loc, 20, 100);
  });

  test('Hijri: a Gregorian date converts via Umm al-Qura, with localized month names', async () => {
    const r = await request(app).get('/api/v1/islamic/hijri/convert').set(auth(token)).query({ date: '2025-03-01', lang: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.hijri.year).toBe(1446);
    expect(r.body.hijri.month).toBe(9);          // Ramadan
    expect(r.body.hijri.is_ramadan).toBe(true);
    expect(r.body.hijri.month_name).toBe('Ramadan');
    // Arabic month name for the RTL markets
    const ar = await request(app).get('/api/v1/islamic/hijri/convert').set(auth(token)).query({ date: '2025-03-01', lang: 'ar' });
    expect(ar.body.hijri.month_name).toBe('رمضان');
    // a non-Ramadan date
    const dec = await request(app).get('/api/v1/islamic/hijri/convert').set(auth(token)).query({ date: '2025-12-01' });
    expect(dec.body.hijri.is_ramadan).toBe(false);
  });

  test('localization reflects the business language and the RTL flag follows Arabic', async () => {
    let l = (await request(app).get('/api/v1/islamic/localization').set(auth(token))).body;
    expect(l.language).toBe('en');
    expect(l.is_rtl).toBe(false);
    expect(l.supported.find(s => s.code === 'so')).toBeTruthy();

    const upd = await request(app).put('/api/v1/settings').set(auth(token)).send({ name: 'Suuq', currency: 'USD', language: 'ar' });
    expect(upd.status).toBe(200);
    l = (await request(app).get('/api/v1/islamic/localization').set(auth(token))).body;
    expect(l.language).toBe('ar');
    expect(l.is_rtl).toBe(true);
  });

  test('Zakat is derived from the ledger at 2.5%, gated by nisab', async () => {
    await makeSale(token, loc, prod, { qty: 5, price: 20 }); // posts 100 cash into the GL
    const a = (await request(app).get('/api/v1/islamic/zakat/assessment').set(auth(token)).query({ nisab: 10 })).body;
    expect(a.rate).toBe(0.025);
    expect(a.assets).toBeGreaterThan(0);
    expect(a.base).toBeCloseTo(a.assets - a.liabilities, 2);      // base = zakatable assets − liabilities
    expect(a.meets_nisab).toBe(true);
    expect(a.due).toBe(true);
    expect(a.amount).toBeCloseTo(+(a.base * 0.025).toFixed(2), 2); // 2.5%
    expect(a.as_of_hijri).toMatch(/AH$/);

    // wealth below nisab → not due, nothing payable
    const b = (await request(app).get('/api/v1/islamic/zakat/assessment').set(auth(token)).query({ nisab: 1000000 })).body;
    expect(b.meets_nisab).toBe(false);
    expect(b.due).toBe(false);
    expect(b.amount).toBe(0);
  });
});

describe('delivery — consumer ordering + driver dispatch (opt-in marketplace)', () => {
  let token, bizId;
  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'delivery');
    await location(token);
    bizId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).businessId;
  });

  test('gated off by default', async () => {
    const other = await register();
    expect((await request(app).get('/api/v1/delivery/drivers').set(auth(other))).status).toBe(403);
  });

  test('auto-dispatch matches an available driver; a completed delivery posts the fee to the ledger', async () => {
    const drv = await request(app).post('/api/v1/delivery/drivers').set(auth(token)).send({ name: 'Cabdi', phone: '0610001', vehicle_type: 'motorbike' });
    expect(drv.status).toBe(201);
    expect((await request(app).put(`/api/v1/delivery/drivers/${drv.body.id}/status`).set(auth(token)).send({ status: 'available' })).status).toBe(200);

    // A WhatsApp-channel COD order with auto-assign matches the idle driver.
    const del = await request(app).post('/api/v1/delivery').set(auth(token)).send({
      customer_name: 'Hodan', customer_phone: '0612345', address: 'Street 5, Hargeisa',
      channel: 'whatsapp', order_amount: 40, delivery_fee: 5, payment_mode: 'cod',
    });
    expect(del.status).toBe(201);
    expect(del.body.status).toBe('assigned');
    expect(del.body.driver_id).toBe(drv.body.id);
    expect((await request(app).get('/api/v1/delivery/drivers').set(auth(token)).query({ status: 'busy' })).body.drivers.length).toBe(1);

    expect((await request(app).put(`/api/v1/delivery/${del.body.id}/status`).set(auth(token)).send({ status: 'picked_up' })).status).toBe(200);
    const done = await request(app).put(`/api/v1/delivery/${del.body.id}/status`).set(auth(token)).send({ status: 'delivered' });
    expect(done.body.status).toBe('delivered');

    // COD delivery fee → Dr AR (driver owes), Cr Delivery Revenue.
    const bal = await accounting.accountBalances(bizId);
    const at = (c) => (bal.find(a => a.code === c) || { balance: 0 }).balance;
    expect(at('4100')).toBeCloseTo(5, 2);
    expect(at('1100')).toBeCloseTo(5, 2);

    // Driver is freed back to available once the job closes.
    expect((await request(app).get('/api/v1/delivery/drivers').set(auth(token)).query({ status: 'available' })).body.drivers.length).toBe(1);
  });

  test('no available driver → the order stays pending for manual assignment', async () => {
    const t2 = await register();
    await enableModule(t2, 'delivery');
    await location(t2);
    const del = await request(app).post('/api/v1/delivery').set(auth(t2)).send({
      customer_name: 'Axmed', address: 'Road 2', order_amount: 10, delivery_fee: 2,
    });
    expect(del.status).toBe(201);
    expect(del.body.status).toBe('pending');
    expect(del.body.driver_id).toBeNull();
  });

  test('public consumer ordering: catalog → place order → it lands as a pending delivery', async () => {
    const loc2 = await location(token);
    const prod = await stockedProduct(token, loc2, 8, 50); // price 8

    // public catalog (no auth) lists the shop's products
    const cat = await request(app).get(`/api/v1/shop/${bizId}/catalog`);
    expect(cat.status).toBe(200);
    expect(cat.body.shop.id).toBe(bizId);
    const item = cat.body.products.find(p => p.id === prod);
    expect(item && item.price).toBe(8);

    // a consumer places an order (no account) — total computed server-side (3×8=24)
    const order = await request(app).post(`/api/v1/shop/${bizId}/order`).send({
      customer_name: 'Layla', phone: '0613334', address: 'Jigjiga Yar, Hargeisa',
      items: [{ product_id: prod, quantity: 3 }],
    });
    expect(order.status).toBe(201);
    expect(order.body.order_amount).toBe(24);
    expect(order.body.status).toBe('pending');

    // it shows up in the merchant's dispatch board as a web-channel pending order
    const board = await request(app).get('/api/v1/delivery').set(auth(token)).query({ status: 'pending' });
    const mine = board.body.deliveries.find(d => d.id === order.body.order_id);
    expect(mine).toBeTruthy();
    expect(mine.channel).toBe('web');

    // public order tracking by id
    const track = await request(app).get(`/api/v1/shop/order/${order.body.order_id}/status`);
    expect(track.status).toBe(200);
    expect(track.body.status).toBe('pending');
  });

  test('a shop without delivery enabled is not open for orders', async () => {
    const t3 = await register();
    const bid = JSON.parse(Buffer.from(t3.split('.')[1], 'base64').toString()).businessId;
    expect((await request(app).get(`/api/v1/shop/${bid}/catalog`)).status).toBe(404);
  });

  test('zone sets the delivery fee on a consumer order, and proof-of-delivery is captured', async () => {
    // merchant defines a delivery zone
    const zone = await request(app).post('/api/v1/delivery/zones').set(auth(token)).send({ name: 'Hargeisa Central', fee: 3 });
    expect(zone.status).toBe(201);
    expect(zone.body.fee).toBe(3);

    const loc = await location(token);
    const prod = await stockedProduct(token, loc, 8, 50);
    // catalog exposes zones to the consumer
    const cat = await request(app).get(`/api/v1/shop/${bizId}/catalog`);
    expect(cat.body.zones.find(z => z.id === zone.body.id)).toBeTruthy();

    // consumer orders with a zone → fee comes from the zone (server-side)
    const order = await request(app).post(`/api/v1/shop/${bizId}/order`).send({
      customer_name: 'Samira', phone: '0613999', address: 'St 9', zone_id: zone.body.id,
      items: [{ product_id: prod, quantity: 2 }],
    });
    expect(order.status).toBe(201);
    expect(order.body.delivery_fee).toBe(3);

    // assign a driver, then deliver WITH proof of delivery
    const drv = await request(app).post('/api/v1/delivery/drivers').set(auth(token)).send({ name: 'Maxamed' });
    await request(app).put(`/api/v1/delivery/drivers/${drv.body.id}/status`).set(auth(token)).send({ status: 'available' });
    await request(app).post(`/api/v1/delivery/${order.body.order_id}/assign`).set(auth(token)).send({});
    await request(app).put(`/api/v1/delivery/${order.body.order_id}/status`).set(auth(token)).send({ status: 'picked_up' });
    const done = await request(app).put(`/api/v1/delivery/${order.body.order_id}/status`).set(auth(token))
      .send({ status: 'delivered', recipient_name: 'Samira', pod_note: 'Left at gate' });
    expect(done.body.status).toBe('delivered');
    expect(done.body.recipient_name).toBe('Samira');
    expect(done.body.pod_note).toBe('Left at gate');

    // the fee (zone = 3) posted to delivery revenue
    const bal = await accounting.accountBalances(bizId);
    expect((bal.find(a => a.code === '4100') || { balance: 0 }).balance).toBeGreaterThanOrEqual(3);
  });
});

describe('M-Pesa async settlement — GL reconciliation on the STK callback', () => {
  let token, loc, prod, bizId;
  const at = (bal, c) => (bal.find(a => a.code === c) || { balance: 0 }).balance;

  beforeAll(async () => {
    token = await register();
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 100); // price 10, cost 5
    bizId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).businessId;
    // Stub M-Pesa: charge returns 'pending' (STK push sent, awaiting the customer PIN).
    require('../../lib/payments').register('mpesa', {
      name: 'M-Pesa (test stub)',
      charge: async ({ amount, meta }) => ({ success: true, provider: 'mpesa', reference: `ck-${meta.sale_id}`, amount, status: 'pending', note: 'STK sent' }),
      refund: async () => ({ success: true, status: 'pending' }),
      verify: async () => ({ verified: false, status: 'pending' }),
      getStatus: async () => ({ status: 'pending' }),
    });
  });

  async function ringMpesaSale() {
    const ik = (await request(app).post('/api/v1/sales/initiate').set(auth(token))).body.idempotency_key;
    const res = await request(app).post('/api/v1/sales').set(auth(token)).send({
      idempotency_key: ik, items: [{ product_id: prod, quantity: 2, override_price: 10 }],
      location_id: loc, payment_method: 'mpesa', phone: '254700000001',
    });
    expect(res.status).toBe(201);
    return res.body.id;
  }
  const refOf = async (saleId) => (await prisma.salePayment.findFirst({ where: { saleId, provider: 'mpesa' } })).providerReference;
  const callback = (checkoutId, ok, amount) => request(app).post('/api/v1/payments/webhook/mpesa').send({
    Body: { stkCallback: { CheckoutRequestID: checkoutId, ResultCode: ok ? 0 : 1032,
      CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'QGR7X' }, { Name: 'Amount', Value: amount }] } } },
  });

  test('pending STK books to in-transit clearing (not cash); success settles it to mobile money', async () => {
    const saleId = await ringMpesaSale();
    // Optimistic posting parks the money in clearing (1015), NOT real cash (1010).
    let bal = await accounting.accountBalances(bizId);
    expect(at(bal, '1015')).toBeCloseTo(20, 2);
    expect(at(bal, '1010')).toBeCloseTo(0, 2);
    expect((await prisma.sale.findUnique({ where: { id: saleId } })).status).toBe('pending');

    // Customer enters PIN → success callback moves clearing into real mobile money.
    const cb = await callback(await refOf(saleId), true, 20);
    expect(cb.status).toBe(200);
    expect(cb.body.ResultCode).toBe(0);
    bal = await accounting.accountBalances(bizId);
    expect(at(bal, '1010')).toBeCloseTo(20, 2);  // real cash now
    expect(at(bal, '1015')).toBeCloseTo(0, 2);   // clearing emptied
    expect((await prisma.sale.findUnique({ where: { id: saleId } })).status).toBe('completed');
    expect((await prisma.salePayment.findFirst({ where: { saleId } })).status).toBe('completed');
    expect((await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body.totals.balanced).toBe(true);
  });

  test('a declined STK turns the in-transit amount into a receivable — never phantom cash', async () => {
    const before = await accounting.accountBalances(bizId);
    const ar0 = at(before, '1100'), cash0 = at(before, '1010');

    const saleId = await ringMpesaSale();
    expect(at(await accounting.accountBalances(bizId), '1015')).toBeCloseTo(20, 2);
    const reference = await refOf(saleId);

    // Customer declines → failure callback clears in-transit into AR (customer owes).
    const cb = await callback(reference, false, 20);
    expect(cb.status).toBe(200);
    let bal = await accounting.accountBalances(bizId);
    expect(at(bal, '1015')).toBeCloseTo(0, 2);          // clearing emptied
    expect(at(bal, '1100') - ar0).toBeCloseTo(20, 2);   // booked as a receivable
    expect(at(bal, '1010')).toBeCloseTo(cash0, 2);      // cash untouched — no phantom money
    expect((await prisma.salePayment.findFirst({ where: { saleId } })).status).toBe('failed');
    expect((await prisma.sale.findUnique({ where: { id: saleId } })).status).toBe('pending'); // unpaid
    expect((await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body.totals.balanced).toBe(true);

    // Idempotent: a re-delivered callback finds no pending payment and changes nothing.
    await callback(reference, false, 20);
    bal = await accounting.accountBalances(bizId);
    expect(at(bal, '1100') - ar0).toBeCloseTo(20, 2);
  });
});

describe('mobile-money rails — manual-confirm tenders book to Mobile Money (1010)', () => {
  let token, loc, prod, bizId;
  const at = (bal, c) => (bal.find(a => a.code === c) || { balance: 0 }).balance;

  beforeAll(async () => {
    token = await register();
    loc = await location(token);
    prod = await stockedProduct(token, loc, 10, 1000); // price 10, cost 5
    bizId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).businessId;
  });

  async function ring(method) {
    const ik = (await request(app).post('/api/v1/sales/initiate').set(auth(token))).body.idempotency_key;
    return request(app).post('/api/v1/sales').set(auth(token)).send({
      idempotency_key: ik, items: [{ product_id: prod, quantity: 2, override_price: 10 }],
      location_id: loc, payment_method: method, payment_reference: `${method}-CONF-1`,
    });
  }

  test.each(['edahab', 'evc', 'telebirr', 'cbe_birr', 'mobile_money'])(
    '%s settles immediately to mobile money (not cash)', async (method) => {
      const before = at(await accounting.accountBalances(bizId), '1010');
      const res = await ring(method);
      expect(res.status).toBe(201);
      // Manual-confirm = the cashier already confirmed → the sale completes now.
      expect((await prisma.sale.findUnique({ where: { id: res.body.id } })).status).toBe('completed');
      const after = at(await accounting.accountBalances(bizId), '1010');
      expect(after - before).toBeCloseTo(20, 2); // booked to Mobile Money, not cash
    });

  test('nothing leaked to Cash (1000); books stay balanced', async () => {
    const bal = await accounting.accountBalances(bizId);
    expect(at(bal, '1000')).toBeCloseTo(0, 2);   // 5 mobile-money sales, zero cash
    expect(at(bal, '1010')).toBeCloseTo(100, 2); // 5 × 20
    const tb = (await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body;
    expect(tb.totals.balanced).toBe(true);
  });

  test('the catch-all and every rail are advertised by the payments registry', async () => {
    const methods = (await request(app).get('/api/v1/payments/methods').set(auth(token))).body;
    const keys = (methods.methods || methods).map(m => m.key);
    for (const k of ['edahab', 'evc', 'telebirr', 'cbe_birr', 'mobile_money', 'zaad']) expect(keys).toContain(k);
  });
});

describe('savings circles (hagbad/ayuuto) — rotating group held in trust', () => {
  let token, bizId;
  const at = (bal, c) => (bal.find(a => a.code === c) || { balance: 0 }).balance;

  beforeAll(async () => {
    token = await register();
    await enableModule(token, 'savings');
    bizId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).businessId;
  });

  test('gated off by default', async () => {
    const other = await register();
    expect((await request(app).get('/api/v1/savings/groups').set(auth(other))).status).toBe(403);
  });

  test('contributions held in 2400; payout rotates and nets the pot to zero', async () => {
    const g = await request(app).post('/api/v1/savings/groups').set(auth(token)).send({
      name: 'Suuqa Hagbad', contribution_amount: 10,
      members: [{ name: 'Amina' }, { name: 'Bashir' }, { name: 'Cawo' }],
    });
    expect(g.status).toBe(201);
    const id = g.body.id;
    const members = g.body.member_list;
    expect(members).toHaveLength(3);

    // Everyone contributes cycle 1 via Zaad → 30 held in the savings-payable liability.
    for (const m of members) {
      expect((await request(app).post(`/api/v1/savings/groups/${id}/contribute`).set(auth(token)).send({ member_id: m.id, method: 'zaad' })).status).toBe(201);
    }
    // A member can't contribute twice in one cycle.
    expect((await request(app).post(`/api/v1/savings/groups/${id}/contribute`).set(auth(token)).send({ member_id: members[0].id, method: 'zaad' })).status).toBe(400);

    let bal = await accounting.accountBalances(bizId);
    expect(at(bal, '2400')).toBeCloseTo(30, 2); // held in trust
    expect(at(bal, '1010')).toBeCloseTo(30, 2); // collected via Zaad (mobile money)

    const detail = (await request(app).get(`/api/v1/savings/groups/${id}`).set(auth(token))).body;
    expect(detail.collected_this_cycle).toBeCloseTo(30, 2);
    expect(detail.next_recipient.name).toBe('Amina');

    // Payout cycle 1 → Amina receives the whole pot; the liability nets to zero.
    const p = await request(app).post(`/api/v1/savings/groups/${id}/payout`).set(auth(token)).send({ method: 'zaad' });
    expect(p.status).toBe(201);
    expect(p.body.recipient).toBe('Amina');
    expect(p.body.pot).toBeCloseTo(30, 2);

    bal = await accounting.accountBalances(bizId);
    expect(at(bal, '2400')).toBeCloseTo(0, 2); // released — full cycle nets to zero
    expect((await request(app).get('/api/v1/accounting/trial-balance').set(auth(token))).body.totals.balanced).toBe(true);

    // Rotation advanced; Amina marked paid out; Bashir is next.
    const d2 = (await request(app).get(`/api/v1/savings/groups/${id}`).set(auth(token))).body;
    expect(d2.current_cycle).toBe(2);
    expect(d2.next_recipient.name).toBe('Bashir');
    expect(d2.schedule.find(s => s.name === 'Amina').paid_out).toBe(true);

    // Can't pay out before anyone has contributed in the new cycle.
    expect((await request(app).post(`/api/v1/savings/groups/${id}/payout`).set(auth(token)).send({})).status).toBe(400);
  });
});

describe('loyalty stamp cards (buy-N-get-1)', () => {
  let token, custId, cardId;
  beforeAll(async () => {
    token = await register();
    const c = await request(app).post('/api/v1/customers').set(auth(token)).send({ name: 'Coffee Regular', phone: '0700222' });
    custId = c.body.id;
    const card = await request(app).post('/api/v1/loyalty/stamp-cards').set(auth(token)).send({ name: 'Coffee Card', stamps_required: 9, reward: 'Free coffee' });
    expect(card.status).toBe(201);
    cardId = card.body.id;
  });

  test('stamps accrue, the reward fires on completion, and extra stamps roll over', async () => {
    // 8 stamps → not yet
    let r = await request(app).post(`/api/v1/loyalty/stamp-cards/${cardId}/stamp`).set(auth(token)).send({ customer_id: custId, count: 8 });
    expect(r.body.stamps).toBe(8);
    expect(r.body.reward_earned).toBe(false);

    // 9th stamp → reward earned, card resets
    r = await request(app).post(`/api/v1/loyalty/stamp-cards/${cardId}/stamp`).set(auth(token)).send({ customer_id: custId, count: 1 });
    expect(r.body.reward_earned).toBe(true);
    expect(r.body.reward).toBe('Free coffee');
    expect(r.body.stamps).toBe(0);
    expect(r.body.completed_count).toBe(1);

    // 10 at once → one more reward + a single rolled-over stamp
    r = await request(app).post(`/api/v1/loyalty/stamp-cards/${cardId}/stamp`).set(auth(token)).send({ customer_id: custId, count: 10 });
    expect(r.body.rewards_earned).toBe(1);
    expect(r.body.stamps).toBe(1);
    expect(r.body.completed_count).toBe(2);

    const p = (await request(app).get(`/api/v1/loyalty/stamp-cards/${cardId}/customer/${custId}`).set(auth(token))).body;
    expect(p.stamps).toBe(1);
    expect(p.completed_count).toBe(2);
  });
});

afterAll(async () => { await prisma.$disconnect(); });
