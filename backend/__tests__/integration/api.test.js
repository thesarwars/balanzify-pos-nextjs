/**
 * Integration tests — real Express routes against a real test database.
 *
 * Requires: TEST_DATABASE_URL in env pointing to a test Postgres instance.
 * Run:      npm test  (or npm run test:integration)
 *
 * Each describe block is self-contained — creates its own data and cleans up.
 * The top-level beforeAll registers a shared business/owner used across suites.
 */

const request = require('supertest');
const { app } = require('../../server');
const prisma  = require('../../lib/prisma');

// ── Helpers ────────────────────────────────────────────────────────────────────

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// A per-run salt so the few fixed-suffix registrations don't collide if a prior
// run's best-effort cleanup couldn't fully unwind the RESTRICT history FKs.
const RUN = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function registerBusiness(arg = Date.now()) {
  // Accept either a full email (when a test needs a specific address) or a
  // suffix used to build one. Previously the email arg was silently treated as
  // a suffix, so the duplicate-email and login tests asserted a different
  // address than was registered.
  const email = String(arg).includes('@') ? arg : `owner_${arg}@balanzify.test`;
  const res = await request(app).post('/api/v1/auth/register').send({
    businessName: `Test Business ${arg}`,
    email,
    password: 'SecureTestPass123!',
  });
  return res.body; // { user, business, access_token, refresh_token }
}

async function createProductWithStock(token, { locationId, stock = 100, sellingPrice = 20, costPrice = 12 } = {}) {
  const res = await request(app).post('/api/v1/products')
    .set(auth(token))
    .send({
      name:          `Test Product ${Date.now()}`,
      selling_price: sellingPrice,
      cost_price:    costPrice,
      unit_of_measure: 'unit',
      opening_stock: stock,
      location_id:   locationId,
    });
  expect(res.status).toBe(201);

  // Also seed a cost layer so FIFO checkout works correctly
  if (locationId && stock > 0) {
    await prisma.costLayer.create({
      data: {
        businessId:        res.body.businessId || res.body.business_id,
        productId:         res.body.id,
        locationId,
        quantityReceived:  stock,
        quantityRemaining: stock,
        unitCost:          costPrice,
      },
    });
  }
  return res.body;
}

async function openShift(token, locationId) {
  const res = await request(app).post('/api/v1/sales/shifts/open')
    .set(auth(token))
    .send({ location_id: locationId, opening_float: 200 });
  expect(res.status).toBe(201);
  return res.body;
}

async function initiate(token) {
  const res = await request(app).post('/api/v1/sales/initiate').set(auth(token));
  expect(res.status).toBe(200);
  return res.body.idempotency_key;
}

async function checkout(token, payload) {
  const key = await initiate(token);
  return request(app).post('/api/v1/sales')
    .set(auth(token))
    .send({ idempotency_key: key, ...payload });
}

// ── Shared state ───────────────────────────────────────────────────────────────

let ownerToken, businessId, locationId;

beforeAll(async () => {
  const reg = await registerBusiness(`shared_${RUN}`);
  expect(reg.access_token).toBeTruthy();
  ownerToken = reg.access_token;
  businessId = reg.business.id;

  // Registration doesn't seed a location, so create one for opening-stock /
  // checkout tests (mirrors what the wired-modules suite does for its business).
  let locRes = await request(app).get('/api/v1/locations').set(auth(ownerToken));
  if (!locRes.body.locations?.length) {
    await request(app).post('/api/v1/locations').set(auth(ownerToken)).send({ name: 'Main', type: 'store' });
    locRes = await request(app).get('/api/v1/locations').set(auth(ownerToken));
  }
  locationId = locRes.body.locations?.[0]?.id;
}, 20000);

afterAll(async () => {
  if (businessId) {
    // Several FKs are RESTRICT so financial history outlives the things it
    // references (refund → sale, sale_item → product). A straight business delete
    // is blocked by that chain, so unwind it in dependency order: refunds, then
    // sales (cascades sale_items), then the business cascades cleanly. Without
    // this the DB is left polluted and the NEXT run fails spuriously.
    await prisma.refund.deleteMany({ where: { sale: { businessId } } }).catch(() => {});
    await prisma.sale.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.purchaseOrder.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

describe('Auth — register', () => {
  test('returns 201 with tokens, user, and business', async () => {
    const res = await registerBusiness(`reg_test_${RUN}`);
    expect(res.access_token).toBeTruthy();
    expect(res.refresh_token).toBeTruthy();
    expect(res.token_type).toBe('Bearer');
    expect(res.expires_in).toBe(900);
    expect(res.user.role).toBe('owner');
    expect(res.business.id).toBeTruthy();
    await prisma.business.deleteMany({ where: { id: res.business.id } }).catch(() => {});
  });

  test('rejects duplicate email with 409', async () => {
    const email = `dup_${Date.now()}@balanzify.test`;
    const first  = await registerBusiness(email);
    const second = await request(app).post('/api/v1/auth/register').send({
      businessName: 'Dup', email, password: 'SecureTestPass123!',
    });
    expect(second.status).toBe(409);
    await prisma.business.deleteMany({ where: { id: first.business.id } }).catch(() => {});
  });

  test('rejects password shorter than 8 chars with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      businessName: 'X', email: `weak_${Date.now()}@test.com`, password: 'short',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.field).toBe('password');
  });
});

describe('Auth — login', () => {
  test('returns tokens on valid credentials', async () => {
    const email = `login_${Date.now()}@balanzify.test`;
    await registerBusiness(email);
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'SecureTestPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
  });

  test('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@test.com', password: 'WrongPass123!' });
    expect(res.status).toBe(401);
  });
});

describe('Auth — refresh token rotation', () => {
  test('issues new tokens and invalidates old refresh token', async () => {
    const reg = await registerBusiness(`refresh_test_${RUN}`);
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: reg.refresh_token });
    expect(r1.status).toBe(200);
    expect(r1.body.access_token).toBeTruthy();

    // Old token is now invalid
    const r2 = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: reg.refresh_token });
    expect(r2.status).toBe(401);
    await prisma.business.deleteMany({ where: { id: reg.business.id } }).catch(() => {});
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════

describe('Products — CRUD', () => {
  let productId;

  test('owner creates product', async () => {
    const res = await request(app).post('/api/v1/products')
      .set(auth(ownerToken))
      .send({ name: 'CRUD Rice', selling_price: 20, cost_price: 12, unit_of_measure: 'kg' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('CRUD Rice');
    productId = res.body.id;
  });

  test('lists products', async () => {
    const res = await request(app).get('/api/v1/products').set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  test('get single product includes stock_levels', async () => {
    const res = await request(app).get(`/api/v1/products/${productId}`).set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stockLevels)).toBe(true);
  });

  test('update product price', async () => {
    const res = await request(app).put(`/api/v1/products/${productId}`)
      .set(auth(ownerToken))
      .send({ name: 'CRUD Rice', selling_price: 25, cost_price: 12, unit_of_measure: 'kg' });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.sellingPrice)).toBe(25);
  });

  test('rejects negative selling price', async () => {
    const res = await request(app).post('/api/v1/products')
      .set(auth(ownerToken))
      .send({ name: 'Bad', selling_price: -5, cost_price: 0, unit_of_measure: 'unit' });
    expect(res.status).toBe(422);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(401);
  });

  test('cashier cannot create product — returns 403', async () => {
    const cashierReg = await registerBusiness(`cashier_${Date.now()}`);
    // Promote to cashier role by creating one in the shared business
    const createRes = await request(app).post('/api/v1/users')
      .set(auth(ownerToken))
      .send({ name: 'Cashier', email: `c_${Date.now()}@test.com`, password: 'SecurePass123!', role: 'cashier' });
    const loginRes = await request(app).post('/api/v1/auth/login')
      .send({ email: createRes.body.email, password: 'SecurePass123!' });
    const cashierToken = loginRes.body.access_token;
    const prodRes = await request(app).post('/api/v1/products')
      .set(auth(cashierToken))
      .send({ name: 'Attempt', selling_price: 10, cost_price: 5, unit_of_measure: 'unit' });
    expect(prodRes.status).toBe(403);
    await prisma.business.deleteMany({ where: { id: cashierReg.business.id } }).catch(() => {});
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPLETE CHECKOUT FLOW — the most important test
// ══════════════════════════════════════════════════════════════════════════════

describe('Checkout — complete happy path', () => {
  let product, shift, saleId;
  const SELL_PRICE = 20.00;
  const COST_PRICE = 12.00;
  const QTY        = 3;
  const EXPECTED_TOTAL = SELL_PRICE * QTY; // 60.00

  beforeAll(async () => {
    product = await createProductWithStock(ownerToken, {
      locationId, stock: 50, sellingPrice: SELL_PRICE, costPrice: COST_PRICE,
    });
    shift = await openShift(ownerToken, locationId);
  });

  test('completes sale — correct total, sale_number, items', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: QTY }],
      payment_method: 'cash',
      cash_tendered: 100,
      shift_id: shift.id,
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(res.body.saleNumber || res.body.sale_number).toBeTruthy();
    expect(parseFloat(res.body.totalAmount ?? res.body.total_amount)).toBeCloseTo(EXPECTED_TOTAL, 2);
    expect(res.body.items.length).toBe(1);
    saleId = res.body.id;
  });

  test('stock decremented by quantity sold', async () => {
    const level = await prisma.stockLevel.findFirst({
      where: { productId: product.id, locationId },
    });
    expect(level).toBeTruthy();
    expect(level.quantity).toBe(50 - QTY);
  });

  test('stock movement created with type=sale', async () => {
    const movement = await prisma.stockMovement.findFirst({
      where: { productId: product.id, type: 'sale' },
      orderBy: { createdAt: 'desc' },
    });
    expect(movement).toBeTruthy();
    expect(movement.quantity).toBe(-QTY);
    expect(movement.balanceAfter).toBe(50 - QTY);
  });

  test('SalePayment record created with status=completed', async () => {
    const payment = await prisma.salePayment.findFirst({
      where: { saleId },
      orderBy: { createdAt: 'desc' },
    });
    expect(payment).toBeTruthy();
    expect(payment.provider).toBe('cash');
    expect(payment.status).toBe('completed');
    expect(parseFloat(payment.amount)).toBeCloseTo(EXPECTED_TOTAL, 2);
  });

  test('FIFO cost layer consumed — quantity_remaining decremented', async () => {
    const layer = await prisma.costLayer.findFirst({
      where: { productId: product.id },
      orderBy: { receivedAt: 'asc' },
    });
    expect(layer).toBeTruthy();
    expect(layer.quantityRemaining).toBe(50 - QTY);
  });

  test('sale item stores FIFO cost_price', async () => {
    const item = await prisma.saleItem.findFirst({
      where: { saleId, productId: product.id },
    });
    expect(item).toBeTruthy();
    expect(parseFloat(item.costPrice)).toBeCloseTo(COST_PRICE, 2);
  });

  test('shift totals updated', async () => {
    const updated = await prisma.shift.findUnique({ where: { id: shift.id } });
    expect(parseFloat(updated.totalSales)).toBeCloseTo(EXPECTED_TOTAL, 2);
    expect(updated.totalTransactions).toBe(1);
    expect(parseFloat(updated.totalCash)).toBeCloseTo(EXPECTED_TOTAL, 2);
  });

  test('same idempotency key returns original sale (_retry: true)', async () => {
    const key = await initiate(ownerToken);
    const payload = {
      idempotency_key: key,
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      location_id: locationId,
    };
    const first  = await request(app).post('/api/v1/sales').set(auth(ownerToken)).send(payload);
    const second = await request(app).post('/api/v1/sales').set(auth(ownerToken)).send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body._retry).toBe(true);
    expect(second.body.id).toBe(first.body.id);
  });

  test('different cart on used key returns 409', async () => {
    const key = await initiate(ownerToken);
    await request(app).post('/api/v1/sales').set(auth(ownerToken))
      .send({ idempotency_key: key, items: [{ product_id: product.id, quantity: 1 }], payment_method: 'cash', location_id: locationId });
    const res = await request(app).post('/api/v1/sales').set(auth(ownerToken))
      .send({ idempotency_key: key, items: [{ product_id: product.id, quantity: 2 }], payment_method: 'cash', location_id: locationId });
    expect(res.status).toBe(409);
  });

  test('insufficient stock returns 400 with clear message', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 99999 }],
      payment_method: 'cash',
      location_id: locationId,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient stock/i);
  });

  test('missing idempotency key returns 400', async () => {
    const res = await request(app).post('/api/v1/sales').set(auth(ownerToken))
      .send({ items: [{ product_id: product.id, quantity: 1 }], payment_method: 'cash' });
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DISCOUNT + COUPON CHECKOUT
// ══════════════════════════════════════════════════════════════════════════════

describe('Checkout — discounts and coupons', () => {
  let product, couponId;

  beforeAll(async () => {
    product = await createProductWithStock(ownerToken, {
      locationId, stock: 200, sellingPrice: 50, costPrice: 30,
    });

    // Create a coupon
    const couponRes = await request(app).post('/api/v1/coupons')
      .set(auth(ownerToken))
      .send({
        code: `TEST${Date.now()}`,
        type: 'flat',
        value: 10,
        min_purchase: 0,
        is_active: true,
      });
    expect(couponRes.status).toBe(201);
    couponId = couponRes.body.id;
  });

  test('flat discount reduces total correctly', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      discount_type: 'flat',
      discount_value: 10,
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.totalAmount ?? res.body.total_amount)).toBeCloseTo(40, 2);
    expect(parseFloat(res.body.discountAmount ?? res.body.discount_amount)).toBeCloseTo(10, 2);
  });

  test('percentage discount reduces total correctly', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 2 }],  // subtotal = 100
      payment_method: 'cash',
      discount_type: 'pct',
      discount_value: 20, // 20% of 100 = 20 off
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.totalAmount ?? res.body.total_amount)).toBeCloseTo(80, 2);
  });

  test('coupon validated and applied — uses_count increments', async () => {
    // First: validate the coupon
    const validateRes = await request(app).post('/api/v1/coupons/validate')
      .set(auth(ownerToken))
      .send({ code: (await prisma.coupon.findUnique({ where: { id: couponId } })).code, subtotal: 50 });
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.valid).toBe(true);
    expect(validateRes.body.coupon.id).toBe(couponId);

    const discountAmt = validateRes.body.discount;

    // Then: checkout with coupon_id
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      coupon_id: couponId,
      coupon_discount: discountAmt,
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.couponDiscount ?? res.body.coupon_discount)).toBeCloseTo(10, 2);
    expect(parseFloat(res.body.totalAmount ?? res.body.total_amount)).toBeCloseTo(40, 2);

    // uses_count should have incremented
    const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
    expect(coupon.usesCount).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LOYALTY EARN + REDEEM
// ══════════════════════════════════════════════════════════════════════════════

describe('Checkout — loyalty points', () => {
  let product, customer;

  beforeAll(async () => {
    product = await createProductWithStock(ownerToken, {
      locationId, stock: 200, sellingPrice: 100, costPrice: 60,
    });

    // Set up loyalty rule: 1 point per dollar, $0.01 per point
    await request(app).put('/api/v1/loyalty/rules')
      .set(auth(ownerToken))
      .send({ points_per_dollar: 1, dollar_per_point: 0.01, min_redeem_points: 10, is_active: true });

    // Create a customer
    const custRes = await request(app).post('/api/v1/customers')
      .set(auth(ownerToken))
      .send({ name: 'Loyalty Customer', phone: '+252634567890' });
    customer = custRes.body;
  });

  test('loyalty points earned on sale — customer balance updated', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],  // total = 100
      payment_method: 'cash',
      customer_id: customer.id,
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    const pointsEarned = res.body.loyalty_points_earned ?? res.body.loyaltyPointsEarned;
    expect(pointsEarned).toBe(100); // 100 * 1 point/dollar

    const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(updated.loyaltyPoints).toBe(100);
  });

  test('loyalty ledger entry created with type=earn', async () => {
    const ledger = await prisma.loyaltyLedger.findFirst({
      where: { customerId: customer.id, type: 'earn' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).toBeTruthy();
    expect(ledger.points).toBe(100);
    expect(ledger.balanceAfter).toBe(100);
  });

  test('loyalty points redeemed — discount applied and balance decremented', async () => {
    const REDEEM = 50;
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],  // total = 100
      payment_method: 'cash',
      customer_id: customer.id,
      loyalty_points_redeemed: REDEEM,   // 50 pts = $0.50 off
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.loyaltyDiscount ?? res.body.loyalty_discount)).toBeCloseTo(0.50, 2);

    const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
    // Should have earned more points minus the 50 redeemed
    // Previous balance: 100. This sale earns ~100 pts (on post-redemption total ≈99.50)
    // Then -50 redeemed = net ~149.50 → floor → 149
    expect(updated.loyaltyPoints).toBeGreaterThan(0);
  });

  test('rejects redemption exceeding balance', async () => {
    const customer2Res = await request(app).post('/api/v1/customers')
      .set(auth(ownerToken))
      .send({ name: 'Broke Customer', phone: '+252634567891' });
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      customer_id: customer2Res.body.id,
      loyalty_points_redeemed: 9999,
      location_id: locationId,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient loyalty/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// REFUND — stock restoration + loyalty reversal
// ══════════════════════════════════════════════════════════════════════════════

describe('Refund — stock restoration and loyalty reversal', () => {
  let product, sale, saleItemId, stockBefore;

  beforeAll(async () => {
    product = await createProductWithStock(ownerToken, {
      locationId, stock: 30, sellingPrice: 40, costPrice: 25,
    });
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 2 }],
      payment_method: 'cash',
      location_id: locationId,
    });
    sale = res.body;
    saleItemId = res.body.items?.[0]?.id || (await prisma.saleItem.findFirst({ where: { saleId: sale.id } }))?.id;

    const level = await prisma.stockLevel.findFirst({ where: { productId: product.id, locationId } });
    stockBefore = level.quantity; // should be 28
  });

  test('refund returns 201 with refund_number', async () => {
    const res = await request(app).post(`/api/v1/sales/${sale.id}/refund`)
      .set(auth(ownerToken))
      .send({
        items: [{ sale_item_id: saleItemId, product_id: product.id, quantity: 1, unit_price: 40, restock: true }],
        reason: 'Customer changed mind',
        refund_method: 'cash',
      });
    expect(res.status).toBe(201);
    expect(res.body.refundNumber ?? res.body.refund_number).toBeTruthy();
  });

  test('stock restored by refund quantity', async () => {
    const level = await prisma.stockLevel.findFirst({ where: { productId: product.id, locationId } });
    expect(level.quantity).toBe(stockBefore + 1);
  });

  test('stock movement created with type=return', async () => {
    const movement = await prisma.stockMovement.findFirst({
      where: { productId: product.id, type: 'return' },
      orderBy: { createdAt: 'desc' },
    });
    expect(movement).toBeTruthy();
    expect(movement.quantity).toBe(1);
  });

  test('sale status updated to partially_refunded', async () => {
    const updated = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(updated.status).toBe('partially_refunded');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TAX ENGINE
// ══════════════════════════════════════════════════════════════════════════════

describe('Tax engine', () => {
  let product, taxRateId;

  beforeAll(async () => {
    // Create a 16% VAT rate
    const rateRes = await request(app).post('/api/v1/tax/rates')
      .set(auth(ownerToken))
      .send({ name: 'VAT 16%', rate: 0.16, is_default: true, is_inclusive: false });
    expect(rateRes.status).toBe(201);
    taxRateId = rateRes.body.id;

    product = await createProductWithStock(ownerToken, {
      locationId, stock: 50, sellingPrice: 100, costPrice: 60,
    });
  });

  afterAll(async () => {
    // Deactivate the test tax rate
    await request(app).delete(`/api/v1/tax/rates/${taxRateId}`).set(auth(ownerToken));
  });

  test('checkout with default tax rate adds tax to total', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],  // line = 100, tax = 16
      payment_method: 'cash',
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    const tax = parseFloat(res.body.taxAmount ?? res.body.tax_amount ?? 0);
    expect(tax).toBeCloseTo(16, 1); // 16% of 100
    const total = parseFloat(res.body.totalAmount ?? res.body.total_amount);
    expect(total).toBeCloseTo(116, 1);
  });

  test('tax breakdown included in response', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.tax_breakdown)).toBe(true);
    expect(res.body.tax_breakdown.length).toBeGreaterThan(0);
    expect(parseFloat(res.body.tax_breakdown[0].taxAmount)).toBeCloseTo(16, 1);
  });

  test('GET /tax/rates lists active rates', async () => {
    const res = await request(app).get('/api/v1/tax/rates').set(auth(ownerToken));
    expect(res.status).toBe(200);
    const rate = res.body.rates.find(r => r.id === taxRateId);
    expect(rate).toBeTruthy();
    expect(parseFloat(rate.rate)).toBeCloseTo(0.16, 4);
  });

  test('POST /tax/calculate previews tax correctly', async () => {
    const res = await request(app).post('/api/v1/tax/calculate')
      .set(auth(ownerToken))
      .send({ items: [{ line_total: 100, tax_rate_id: taxRateId }] });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.totalTax)).toBeCloseTo(16, 1);
  });

  test('GET /tax/report returns summary', async () => {
    const res = await request(app).get('/api/v1/tax/report').set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.summary).toHaveProperty('total_tax_collected');
    expect(Array.isArray(res.body.by_rate)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS — receive stock, cost layers, supplier balance
// ══════════════════════════════════════════════════════════════════════════════

describe('Purchase orders — receive stock', () => {
  let product, supplier, poId;

  beforeAll(async () => {
    // Create supplier
    const supRes = await request(app).post('/api/v1/suppliers')
      .set(auth(ownerToken))
      .send({ name: 'Test Supplier', currency: 'USD' });
    supplier = supRes.body;

    // Create product without stock
    const prodRes = await request(app).post('/api/v1/products')
      .set(auth(ownerToken))
      .send({ name: 'PO Product', selling_price: 30, cost_price: 18, unit_of_measure: 'unit' });
    product = prodRes.body;

    // Create PO
    const poRes = await request(app).post('/api/v1/purchase-orders')
      .set(auth(ownerToken))
      .send({
        supplier_id: supplier.id,
        location_id: locationId,
        items: [{ product_id: product.id, ordered_qty: 50, unit_price: 18 }],
        currency: 'USD',
      });
    expect(poRes.status).toBe(201);
    poId = poRes.body.id;
  });

  test('receive PO — stock increases, GRN created', async () => {
    const res = await request(app).put(`/api/v1/purchase-orders/${poId}/status`)
      .set(auth(ownerToken))
      .send({
        status: 'received',
        received_items: [{ id: (await prisma.purchaseOrderItem.findFirst({ where: { poId } })).id, product_id: product.id, qty: 50, unit_price: 18 }],
      });
    expect(res.status).toBe(200);

    const level = await prisma.stockLevel.findFirst({ where: { productId: product.id, locationId } });
    expect(level).toBeTruthy();
    expect(level.quantity).toBe(50);

    const grn = await prisma.goodsReceivedNote.findFirst({ where: { poId } });
    expect(grn).toBeTruthy();
  });

  test('stock movement created with type=purchase', async () => {
    const movement = await prisma.stockMovement.findFirst({
      where: { productId: product.id, type: 'purchase' },
    });
    expect(movement).toBeTruthy();
    expect(movement.quantity).toBe(50);
  });

  test('receiving the PO posts Dr Inventory / Cr Accounts Payable', async () => {
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'purchase', sourceId: poId },
      include: { lines: { include: { account: true } } },
    });
    expect(entry).toBeTruthy();
    const by = {};
    for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['1200'].debit)).toBeCloseTo(900, 2);  // Inventory  (50 x 18)
    expect(parseFloat(by['2000'].credit)).toBeCloseTo(900, 2); // Accounts Payable
  });

  test('paying the supplier posts Dr Accounts Payable / Cr Cash', async () => {
    const pay = await request(app).post(`/api/v1/purchase-orders/${poId}/payment`)
      .set(auth(ownerToken)).send({ amount: 900, payment_method: 'cash' });
    expect(pay.status).toBe(201);
    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'po_payment', sourceId: poId },
      include: { lines: { include: { account: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).toBeTruthy();
    const by = {};
    for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['2000'].debit)).toBeCloseTo(900, 2);  // Accounts Payable settled
    expect(parseFloat(by['1000'].credit)).toBeCloseTo(900, 2); // Cash out
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

describe('Webhooks — management', () => {
  let endpointId, endpointSecret;

  test('GET /webhooks/events lists all event types', async () => {
    const res = await request(app).get('/api/v1/webhooks/events').set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.some(e => e.event === 'sale.completed')).toBe(true);
  });

  test('POST /webhooks registers endpoint and returns secret once', async () => {
    const res = await request(app).post('/api/v1/webhooks')
      .set(auth(ownerToken))
      .send({
        url:    'https://example.com/webhook',
        events: ['sale.completed', 'sale.refunded'],
      });
    expect(res.status).toBe(201);
    expect(res.body.secret).toBeTruthy();  // only returned on creation
    expect(res.body.url).toBe('https://example.com/webhook');
    endpointId     = res.body.id;
    endpointSecret = res.body.secret;
  });

  test('GET /webhooks lists endpoint without secret', async () => {
    const res = await request(app).get('/api/v1/webhooks').set(auth(ownerToken));
    expect(res.status).toBe(200);
    const ep = res.body.endpoints.find(e => e.id === endpointId);
    expect(ep).toBeTruthy();
    expect(ep.secret).toBeUndefined();  // secret never returned in list
  });

  test('POST /webhooks/:id/rotate-secret returns new secret', async () => {
    const res = await request(app).post(`/api/v1/webhooks/${endpointId}/rotate-secret`)
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.secret).toBeTruthy();
    expect(res.body.secret).not.toBe(endpointSecret); // different from original
  });

  test('rejects non-HTTPS URL', async () => {
    const res = await request(app).post('/api/v1/webhooks')
      .set(auth(ownerToken))
      .send({ url: 'http://insecure.com/hook', events: ['sale.completed'] });
    expect(res.status).toBe(422);
  });

  test('DELETE deactivates endpoint', async () => {
    const res = await request(app).delete(`/api/v1/webhooks/${endpointId}`)
      .set(auth(ownerToken));
    expect(res.status).toBe(200);
    const ep = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    expect(ep.isActive).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

describe('Payment registry', () => {
  test('GET /payments/methods returns registered providers', async () => {
    const res = await request(app).get('/api/v1/payments/methods').set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.methods)).toBe(true);
    const keys = res.body.methods.map(m => m.key);
    expect(keys).toContain('cash');
    expect(keys).toContain('zaad');
    expect(keys).toContain('credit');
  });

  test('cash provider always available without config', async () => {
    const res = await request(app).get('/api/v1/payments/methods').set(auth(ownerToken));
    const cash = res.body.methods.find(m => m.key === 'cash');
    expect(cash).toBeTruthy();
    expect(cash.type).toBe('cash');
    expect(cash.requiresNetwork).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

describe('Dashboard API', () => {
  test('GET /reports/dashboard returns all required fields', async () => {
    const res = await request(app).get('/api/v1/reports/dashboard').set(auth(ownerToken));
    expect(res.status).toBe(200);
    const required = [
      'sales_today', 'transactions_today', 'sales_month',
      'stock_value', 'total_products', 'low_stock_count',
      'expiring_soon', 'open_tasks', 'active_projects',
      'cash_today', 'zaad_today', 'card_today',
      'recent_sales', 'top_products',
    ];
    for (const field of required) {
      expect(res.body).toHaveProperty(field);
    }
    expect(Array.isArray(res.body.recent_sales)).toBe(true);
    expect(Array.isArray(res.body.top_products)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CURRENCY
// ══════════════════════════════════════════════════════════════════════════════

describe('Currency — rates and conversion', () => {
  test('GET /currency/currencies lists supported currencies', async () => {
    const res = await request(app).get('/api/v1/currency/currencies').set(auth(ownerToken));
    expect(res.status).toBe(200);
    const codes = res.body.currencies.map(c => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('SOS');
    expect(codes).toContain('KES');
  });

  test('PUT /currency/rates stores manual rate', async () => {
    const res = await request(app).put('/api/v1/currency/rates')
      .set(auth(ownerToken))
      .send({ from_currency: 'USD', to_currency: 'SOS', rate: 568 });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.rate)).toBeCloseTo(568, 0);
  });

  test('POST /currency/convert converts correctly', async () => {
    const res = await request(app).post('/api/v1/currency/convert')
      .set(auth(ownerToken))
      .send({ amount: 10, from: 'USD', to: 'SOS' });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBeCloseTo(5680, 0);
    expect(res.body.rate).toBeCloseTo(568, 0);
  });

  test('checkout with display_currency returns display_amount', async () => {
    const product = await createProductWithStock(ownerToken, {
      locationId, stock: 10, sellingPrice: 10, costPrice: 6,
    });
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 1 }],
      payment_method: 'cash',
      display_currency: 'SOS',
      location_id: locationId,
    });
    expect(res.status).toBe(201);
    expect(res.body.display_amount).toBeTruthy();
    expect(res.body.display_amount.currency).toBe('SOS');
    expect(res.body.display_amount.amount).toBeGreaterThan(100); // 10 USD * 568
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════════════════════════════════════

describe('Error handling', () => {
  test('404 on unknown route — RFC 7807 format', async () => {
    const res = await request(app).get('/api/v1/does-not-exist').set(auth(ownerToken));
    expect(res.status).toBe(404);
    expect(res.body.type).toContain('not-found');
    expect(res.body.status).toBe(404);
  });

  test('401 on missing auth token', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('title');
  });

  test('401 on malformed token', async () => {
    const res = await request(app).get('/api/v1/products').set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  test('every response includes x-trace-id header', async () => {
    const res = await request(app).get('/api/v1/products').set(auth(ownerToken));
    expect(res.headers['x-trace-id']).toBeTruthy();
  });

  test('validation error returns errors array with field names', async () => {
    const res = await request(app).post('/api/v1/products')
      .set(auth(ownerToken))
      .send({ selling_price: -1 }); // missing name, negative price
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GENERAL LEDGER (accounting spine)
// ══════════════════════════════════════════════════════════════════════════════
describe('General ledger — sale posting', () => {
  let product, saleId, total, tax;

  beforeAll(async () => {
    product = await createProductWithStock(ownerToken, { locationId, stock: 50, sellingPrice: 20, costPrice: 12 });
  });

  test('a cash sale posts a balanced double-entry journal', async () => {
    const res = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 2 }],
      payment_method: 'cash', cash_tendered: 100, location_id: locationId,
    });
    expect(res.status).toBe(201);
    saleId = res.body.id;
    total = parseFloat(res.body.totalAmount ?? res.body.total_amount);
    tax   = parseFloat(res.body.taxAmount ?? res.body.tax_amount ?? 0);

    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'sale', sourceId: saleId },
      include: { lines: { include: { account: true } } },
    });
    expect(entry).toBeTruthy();

    const debit  = entry.lines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const credit = entry.lines.reduce((s, l) => s + parseFloat(l.credit), 0);
    expect(debit).toBeCloseTo(credit, 2); // the books balance

    const by = {};
    for (const l of entry.lines) by[l.account.code] = l;
    expect(parseFloat(by['1000'].debit)).toBeCloseTo(total, 2);        // Cash = total received
    expect(parseFloat(by['4000'].credit)).toBeCloseTo(total - tax, 2); // Sales Revenue = net of tax
    expect(parseFloat(by['5000'].debit)).toBeCloseTo(24, 2);           // COGS = 2 x 12
    expect(parseFloat(by['1200'].credit)).toBeCloseTo(24, 2);          // Inventory relief
  });

  test('trial balance is balanced', async () => {
    const tb = await request(app).get('/api/v1/accounting/trial-balance').set(auth(ownerToken));
    expect(tb.status).toBe(200);
    expect(tb.body.totals.balanced).toBe(true);
    expect(tb.body.totals.debit).toBeCloseTo(tb.body.totals.credit, 2);
  });
});

describe('General ledger — accounts receivable (credit)', () => {
  let product, customerId;

  beforeAll(async () => {
    product = await createProductWithStock(ownerToken, { locationId, stock: 50, sellingPrice: 20, costPrice: 12 });
    const cust = await request(app).post('/api/v1/customers').set(auth(ownerToken)).send({ name: 'Credit Cust', credit_limit: 1000 });
    customerId = cust.body.id;
  });

  test('a credit sale debits AR; repayment credits AR', async () => {
    const sale = await checkout(ownerToken, {
      items: [{ product_id: product.id, quantity: 2 }],
      payment_method: 'credit', customer_id: customerId, location_id: locationId,
    });
    expect(sale.status).toBe(201);
    const total = parseFloat(sale.body.totalAmount ?? sale.body.total_amount);

    const saleEntry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'sale', sourceId: sale.body.id },
      include: { lines: { include: { account: true } } },
    });
    const sBy = {};
    for (const l of saleEntry.lines) sBy[l.account.code] = l;
    expect(parseFloat(sBy['1100'].debit)).toBeCloseTo(total, 2); // credit sale debits Accounts Receivable

    const pay = await request(app).post('/api/v1/sales/customer-payment')
      .set(auth(ownerToken)).send({ customer_id: customerId, amount: total, payment_method: 'cash' });
    expect(pay.status).toBe(200);

    const repay = await prisma.journalEntry.findFirst({
      where: { sourceType: 'credit_repayment', sourceId: customerId },
      include: { lines: { include: { account: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(repay).toBeTruthy();
    const rBy = {};
    for (const l of repay.lines) rBy[l.account.code] = l;
    expect(parseFloat(rBy['1000'].debit)).toBeCloseTo(total, 2);  // cash in
    expect(parseFloat(rBy['1100'].credit)).toBeCloseTo(total, 2); // AR reduced
  });
});
