/**
 * Superadmin (SaaS) routes — platform console.
 * Mounted at /api/v1/superadmin behind requireModule('superadmin').
 *
 * NOTE: this is CROSS-TENANT (it lists every business on the platform). It's
 * gated by the superadmin module + owner role; in a real multi-tenant SaaS this
 * should instead be a dedicated platform-operator role, not a per-business module.
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { PackageSchema } = require('../validation/schemas');

const router = express.Router();

const DEFAULT_PACKAGES = [
  { name: 'Starter',    price: 29, interval: 'monthly', locations: 1,  users: 3,  products: 500,   featured: false },
  { name: 'Growth',     price: 49, interval: 'monthly', locations: 3,  users: 10, products: 5000,  featured: true },
  { name: 'Enterprise', price: 99, interval: 'monthly', locations: 99, users: 99, products: 99999, featured: false },
];
async function ensurePackages() {
  if ((await prisma.package.count()) === 0) await prisma.package.createMany({ data: DEFAULT_PACKAGES });
}
async function ensureSaasSettings() {
  return (await prisma.saasSettings.findFirst()) || prisma.saasSettings.create({ data: {} });
}
// Give any business that has no subscription a default active one.
async function ensureSubscriptions() {
  const missing = await prisma.business.findMany({ where: { subscription: { is: null } }, select: { id: true } });
  if (!missing.length) return;
  const featured = (await prisma.package.findFirst({ where: { featured: true } })) || (await prisma.package.findFirst());
  const exp = new Date(); exp.setDate(exp.getDate() + 30);
  await prisma.subscription.createMany({
    data: missing.map(b => ({ businessId: b.id, packageId: featured?.id || null, status: 'active', expiresAt: exp })),
    skipDuplicates: true,
  });
}
const serializePackage = (p) => ({ id: p.id, name: p.name, price: parseFloat(p.price), interval: p.interval, locations: p.locations, users: p.users, products: p.products, featured: p.featured, active: p.active });

// Platform console — owner role only (module gate runs at the mount).
router.use(auth, requireRole('owner'));

router.get('/stats', async (req, res, next) => {
  try {
    await ensurePackages(); await ensureSubscriptions();
    const subs = await prisma.subscription.findMany({ include: { package: { select: { price: true } } } });
    const mrr = subs.filter(s => s.status === 'active').reduce((sum, s) => sum + parseFloat(s.package?.price || 0), 0);
    res.json({
      businesses: subs.length,
      active: subs.filter(s => s.status === 'active').length,
      trial: subs.filter(s => s.status === 'trial').length,
      expired: subs.filter(s => s.status === 'expired').length,
      mrr: +mrr.toFixed(2),
    });
  } catch (err) { next(err); }
});

router.get('/business', async (req, res, next) => {
  try {
    await ensurePackages(); await ensureSubscriptions();
    const businesses = await prisma.business.findMany({
      include: {
        _count: { select: { users: true } },
        users: { where: { role: 'owner' }, take: 1, select: { name: true } },
        subscription: { include: { package: { select: { name: true, price: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(businesses.map(b => ({
      id: b.id, name: b.name, owner: b.users[0]?.name || '—', email: b.email, country: b.country || '—',
      package_id: b.subscription?.packageId || null, package_name: b.subscription?.package?.name || '—',
      package_price: parseFloat(b.subscription?.package?.price || 0),
      status: b.subscription?.status || 'active', users: b._count.users,
      created: b.createdAt.toISOString().slice(0, 10),
      expires: b.subscription?.expiresAt ? b.subscription.expiresAt.toISOString().slice(0, 10) : '',
    })));
  } catch (err) { next(err); }
});

router.put('/business/:id', async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.params.id } });
    if (!biz) return res.status(404).json({ title: 'Not found', status: 404 });
    const data = {};
    if (req.body.status) data.status = req.body.status;
    if (req.body.package_id !== undefined) data.packageId = req.body.package_id || null;
    await prisma.subscription.upsert({ where: { businessId: req.params.id }, create: { businessId: req.params.id, ...data }, update: data });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/package', async (req, res, next) => {
  try { await ensurePackages(); res.json((await prisma.package.findMany({ orderBy: { price: 'asc' } })).map(serializePackage)); }
  catch (err) { next(err); }
});
router.post('/package', validate(PackageSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const p = await prisma.package.create({ data: { name: b.name, price: b.price, interval: b.interval, locations: b.locations, users: b.users, products: b.products, featured: b.featured } });
    res.status(201).json(serializePackage(p));
  } catch (err) { next(err); }
});
router.delete('/package/:id', async (req, res, next) => {
  try {
    const p = await prisma.package.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.package.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.get('/payment', async (req, res, next) => {
  try {
    const pays = await prisma.subscriptionPayment.findMany({ include: { business: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(pays.map(p => ({ id: p.id, business: p.business?.name || '—', amount: parseFloat(p.amount), gateway: p.gateway, date: p.paidAt.toISOString().slice(0, 10), status: p.status })));
  } catch (err) { next(err); }
});
router.put('/payment/:id', async (req, res, next) => {
  try {
    const pay = await prisma.subscriptionPayment.findUnique({ where: { id: req.params.id } });
    if (!pay) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.subscriptionPayment.update({ where: { id: req.params.id }, data: { status: req.body.status || 'completed' } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/gateway', async (req, res, next) => {
  try { res.json((await ensureSaasSettings()).gateways || {}); }
  catch (err) { next(err); }
});
router.put('/gateway', async (req, res, next) => {
  try {
    const s = await ensureSaasSettings();
    const updated = await prisma.saasSettings.update({ where: { id: s.id }, data: { gateways: { ...(s.gateways || {}), ...req.body } } });
    res.json(updated.gateways);
  } catch (err) { next(err); }
});

module.exports = router;
