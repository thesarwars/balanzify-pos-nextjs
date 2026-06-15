// Throwaway e2e: register -> login -> location -> product(+stock) -> initiate -> sale.
// Runs INSIDE the api container against localhost:5000.
const BASE = 'http://localhost:5000/api/v1';

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  const stamp = Date.now();
  const email = `owner_${stamp}@example.com`;
  const password = 'Password123!';
  const log = (label, r) => {
    const body = typeof r.data === 'string' ? r.data.slice(0, 400) : JSON.stringify(r.data);
    console.log(`\n### ${label}  -> HTTP ${r.status}\n${body}`);
    return r;
  };

  const reg = log('REGISTER', await call('POST', '/auth/register', {
    businessName: 'Test Shop', email, password, phone: '+252634000000', country: 'Somaliland',
  }));
  let token = reg.data.access_token;

  const login = log('LOGIN', await call('POST', '/auth/login', { email, password }));
  token = login.data.access_token || token;

  const loc = log('CREATE LOCATION', await call('POST', '/locations', {
    name: 'Main Store', type: 'store',
  }, token));
  const locationId = loc.data.id;

  const prod = log('CREATE PRODUCT (+opening_stock @ location)', await call('POST', '/products', {
    name: 'Cola 330ml', sku: `COLA-${stamp}`, selling_price: 1.50, cost_price: 0.80,
    unit_of_measure: 'unit', opening_stock: 100, location_id: locationId, is_active: true,
  }, token));
  const productId = prod.data.id;

  const init = log('SALE INITIATE', await call('POST', '/sales/initiate', {}, token));
  const key = init.data.idempotency_key;

  const sale = log('RING SALE (2 x Cola, cash)', await call('POST', '/sales', {
    idempotency_key: key,
    items: [{ product_id: productId, quantity: 2 }],
    location_id: locationId,
    payment_method: 'cash',
    cash_tendered: 5.00,
  }, token));

  if ([200, 201].includes(sale.status)) console.log('\n=== E2E PASS: register -> login -> location -> product -> sale ===');
  else console.error('\n=== E2E FAIL at ring sale ===');
})();
