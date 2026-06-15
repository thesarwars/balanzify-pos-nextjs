/**
 * Unit tests — pure functions only, no database, no network.
 * These run in milliseconds and test the business logic in isolation.
 */

const crypto = require('crypto');

// ── Cart fingerprint ───────────────────────────────────────────────────────────
// Copied here to test in isolation — same function as in sales.js
function cartFingerprint(items, cashierId) {
  const payload = items
    .map(i => `${i.product_id}:${i.quantity}:${parseFloat(i.override_price ?? i.unit_price ?? 0).toFixed(4)}`)
    .sort()
    .join('|') + `|cashier:${cashierId}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

describe('cartFingerprint', () => {
  const cashierId = 'user-abc-123';
  const items = [
    { product_id: 'prod-1', quantity: 2, unit_price: 10.50 },
    { product_id: 'prod-2', quantity: 1, unit_price: 5.00 },
  ];

  test('same items produce same fingerprint', () => {
    expect(cartFingerprint(items, cashierId)).toBe(cartFingerprint(items, cashierId));
  });

  test('different quantity changes fingerprint', () => {
    const modified = [{ ...items[0], quantity: 3 }, items[1]];
    expect(cartFingerprint(modified, cashierId)).not.toBe(cartFingerprint(items, cashierId));
  });

  test('different price changes fingerprint', () => {
    const modified = [{ ...items[0], unit_price: 11.00 }, items[1]];
    expect(cartFingerprint(modified, cashierId)).not.toBe(cartFingerprint(items, cashierId));
  });

  test('different cashier changes fingerprint', () => {
    expect(cartFingerprint(items, 'other-user')).not.toBe(cartFingerprint(items, cashierId));
  });

  test('item order does not matter — sorted before hashing', () => {
    const reversed = [items[1], items[0]];
    expect(cartFingerprint(reversed, cashierId)).toBe(cartFingerprint(items, cashierId));
  });

  test('override_price takes precedence over unit_price', () => {
    const withOverride = [{ ...items[0], override_price: 9.00 }, items[1]];
    const withUnitPrice = [{ ...items[0], unit_price: 9.00 }, items[1]];
    expect(cartFingerprint(withOverride, cashierId)).toBe(cartFingerprint(withUnitPrice, cashierId));
  });

  test('returns 64-char hex string', () => {
    const fp = cartFingerprint(items, cashierId);
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[a-f0-9]+$/);
  });
});

// ── Validation schemas ─────────────────────────────────────────────────────────
const { RegisterSchema, SaleSchema, ProductSchema, PaginationSchema } = require('../../validation/schemas');

describe('RegisterSchema', () => {
  test('valid registration passes', () => {
    const result = RegisterSchema.safeParse({
      businessName: 'Ahmed Trading', email: 'ahmed@example.com', password: 'SecurePass123',
    });
    expect(result.success).toBe(true);
  });

  test('short password fails', () => {
    const result = RegisterSchema.safeParse({ businessName: 'Test', email: 'test@test.com', password: 'short' });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].path).toContain('password');
  });

  test('invalid email fails', () => {
    const result = RegisterSchema.safeParse({ businessName: 'Test', email: 'not-an-email', password: 'SecurePass123' });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].path).toContain('email');
  });

  test('email is lowercased', () => {
    const result = RegisterSchema.safeParse({ businessName: 'Test', email: 'AHMED@EXAMPLE.COM', password: 'SecurePass123' });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe('ahmed@example.com');
  });
});

describe('SaleSchema', () => {
  const validSale = {
    idempotency_key: 'test-key-12345678901',
    items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
    payment_method: 'cash',
  };

  test('valid sale passes', () => {
    expect(SaleSchema.safeParse(validSale).success).toBe(true);
  });

  test('empty items fails', () => {
    const result = SaleSchema.safeParse({ ...validSale, items: [] });
    expect(result.success).toBe(false);
  });

  test('invalid product uuid fails', () => {
    const result = SaleSchema.safeParse({ ...validSale, items: [{ product_id: 'not-a-uuid', quantity: 1 }] });
    expect(result.success).toBe(false);
  });

  test('zero quantity fails', () => {
    const result = SaleSchema.safeParse({ ...validSale, items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 }] });
    expect(result.success).toBe(false);
  });

  test('split payment with no amounts fails', () => {
    const result = SaleSchema.safeParse({ ...validSale, payment_method: 'split' });
    expect(result.success).toBe(false);
  });

  test('missing idempotency key fails', () => {
    const { idempotency_key, ...rest } = validSale;
    const result = SaleSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('ProductSchema', () => {
  test('valid product passes', () => {
    const result = ProductSchema.safeParse({ name: 'Rice 25kg', selling_price: 20.00, cost_price: 15.00 });
    expect(result.success).toBe(true);
  });

  test('negative price fails', () => {
    const result = ProductSchema.safeParse({ name: 'Rice', selling_price: -5 });
    expect(result.success).toBe(false);
  });

  test('defaults are applied', () => {
    const result = ProductSchema.safeParse({ name: 'Rice' });
    expect(result.success).toBe(true);
    expect(result.data.unit_of_measure).toBe('unit');
    expect(result.data.track_expiry).toBe(false);
    expect(result.data.allow_price_override).toBe(true);
  });
});

describe('PaginationSchema', () => {
  test('defaults applied when empty', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(50);
    expect(result.data.order).toBe('desc');
  });

  test('limit above 500 fails', () => {
    const result = PaginationSchema.safeParse({ limit: 1000 });
    expect(result.success).toBe(false);
  });

  test('string numbers are coerced', () => {
    const result = PaginationSchema.safeParse({ page: '2', limit: '25' });
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(2);
    expect(result.data.limit).toBe(25);
  });
});
