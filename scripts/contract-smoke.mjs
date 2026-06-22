#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Frontend ⇄ backend contract smoke test.
//
//  Replays the exact /api/v1 calls the frontend's typed client (lib/api.ts,
//  REAL_MODE) makes, and asserts the responses carry the shapes the screens
//  read. Run this against a live backend before flipping the UI to live mode,
//  or in CI, to catch contract drift.
//
//    BACKEND_URL=http://localhost:5000 node scripts/contract-smoke.mjs
// ═══════════════════════════════════════════════════════════════════
const ORIGIN = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const BASE = ORIGIN + '/api/v1';
let token = null;
const results = [];

async function call(method, path, { body, auth = true, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch((raw ? ORIGIN : BASE) + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
function check(name, cond, detail = '') {
  results.push(!!cond);
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const stamp = Date.now();
let r = await call('POST', '/auth/register', { auth: false, body: { businessName: 'Smoke Co ' + stamp, email: `smoke_${stamp}@balanzify.test`, password: 'SecureTestPass123!' } });
check('auth.register → access_token + user', r.status === 201 && r.json.access_token && r.json.user?.role, 'status ' + r.status);
token = r.json.access_token;

r = await call('POST', '/locations', { body: { name: 'Main', type: 'store' } });
const locId = r.json.id;
check('locations.create', r.status === 201 && locId);
r = await call('POST', '/products', { body: { name: 'Smoke Product', selling_price: 25, cost_price: 12, unit_of_measure: 'unit', opening_stock: 40, location_id: locId } });
const prodId = r.json.id;
check('products.create → id', r.status === 201 && prodId, 'status ' + r.status);
r = await call('GET', '/products');
const list = r.json.products || r.json.data || r.json;
check('products.list returns the product', Array.isArray(list) && list.some((p) => p.id === prodId));

r = await call('GET', '/islamic/zakat/assessment');
check('islamic.zakat → base/amount/assetLines', r.status === 200 && 'base' in r.json && 'amount' in r.json && Array.isArray(r.json.assetLines));
r = await call('GET', '/islamic/hijri/today');
check('islamic.hijriToday → hijri.formatted', r.status === 200 && !!r.json.hijri?.formatted, r.json.hijri?.formatted || '');
r = await call('GET', '/islamic/localization');
check('islamic.localization → is_rtl + supported', r.status === 200 && 'is_rtl' in r.json && Array.isArray(r.json.supported));
r = await call('GET', '/lending/assessment');
check('lending.assessment → score + recommended_limit', r.status === 200 && 'score' in r.json && 'recommended_limit' in r.json);
r = await call('GET', '/lending/advances');
check('lending.advances → advances[]', r.status === 200 && Array.isArray(r.json.advances));
r = await call('GET', '/fiscal/config');
check('fiscal.config → enabled/jurisdiction', r.status === 200 && 'enabled' in r.json && 'jurisdiction' in r.json);
r = await call('GET', '/fiscal/pending');
check('fiscal.pending → receipts[]', r.status === 200 && Array.isArray(r.json.receipts));
r = await call('GET', '/sync/devices');
check('sync.devices → devices[]', r.status === 200 && Array.isArray(r.json.devices));
r = await call('GET', '/fiscal/verify/NONEXISTENTCODE', { auth: false, raw: true });
check('fiscal.verify (public) responds', r.status === 404 && r.json.valid === false);

const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} contract checks passed ===`);
process.exit(passed === results.length ? 0 : 1);
