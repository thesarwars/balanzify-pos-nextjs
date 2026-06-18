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
const { app } = require('../../server');
const prisma = require('../../lib/prisma');

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
  const cat = (await request(app).get('/api/v1/modules').set(auth(token))).body.catalog;
  const enabledModules = [...new Set([...cat.filter(m => m.enabled).map(m => m.key), key])];
  const res = await request(app).put('/api/v1/modules').set(auth(token)).send({ enabledModules });
  expect(res.status).toBe(200);
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
});

afterAll(async () => { await prisma.$disconnect(); });
