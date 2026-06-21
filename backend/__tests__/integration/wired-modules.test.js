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

    // GL: payroll posts gross wages (800) = net cash (600) + deductions (200)
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'payroll', sourceId: pay.id },
      include: { lines: { include: { account: true } } },
    });
    expect(entry).toBeTruthy();
    const by = {};
    for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['5100'].debit)).toBeCloseTo(800, 2);  // Salaries & Wages expense
    expect(parseFloat(by['1000'].credit)).toBeCloseTo(600, 2); // Net pay (cash)
    expect(parseFloat(by['2100'].credit)).toBeCloseTo(200, 2); // Deductions withheld
  });
  test('leave balance accrual + over-apply 422', async () => {
    const e = (await request(app).post('/api/v1/hrm/employee').set(auth(token)).send({ name: 'Bashir', salary: 700, joined: '2026-01-01' })).body;
    const bal = (await request(app).get('/api/v1/hrm/leave-balance/' + e.id).set(auth(token))).body;
    const sick = bal.find(b => b.type === 'Sick');
    expect(sick.entitled).toBe(12);
    expect((await request(app).post('/api/v1/hrm/leave').set(auth(token)).send({ employee_id: e.id, type: 'Sick', from: '2026-07-01', to: '2026-07-30', days: 20 })).status).toBe(422);
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

afterAll(async () => { await prisma.$disconnect(); });
