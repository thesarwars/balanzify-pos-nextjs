/**
 * Modules & Markets Routes — the product-family layer.
 *
 * GET  /api/v1/modules            — full catalog (every sellable module) + this business's plan
 * PUT  /api/v1/modules            — owner sets enabled modules (sales/admin tooling)
 * GET  /api/v1/modules/market     — this business's market profile (currency, rails, languages, compliance)
 * PUT  /api/v1/modules/market     — owner sets market (drives defaults across the app)
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { MODULES, resolveEnabled } = require('../lib/modules');
const { MARKETS, getMarket } = require('../lib/markets');
const { ensureMarketTaxRate } = require('../lib/marketTax');
const { requireModule } = require('../lib/moduleGate');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: { enabledModules: true, market: true },
    });
    const enabled = resolveEnabled(biz?.enabledModules);
    res.json({
      catalog: Object.values(MODULES).map(m => ({
        key: m.key, name: m.name, description: m.description,
        standalone: !!m.standalone, requires: m.requires || [],
        alwaysOn: !!m.alwaysOn,        // core — never toggleable
        addon: m.default === false,    // opt-in add-on / vertical (vs base plan)
        enabled: enabled.has(m.key),
      })),
      plan: {
        licensed: biz?.enabledModules?.length ? biz.enabledModules : ['(base plan)'],
        effective: [...enabled],
      },
    });
  } catch (err) { next(err); }
});

router.put('/', auth, requireRole('owner'), validate(z.object({
  enabledModules: z.array(z.enum(Object.keys(MODULES))).max(20),
})), async (req, res, next) => {
  try {
    const requested = req.body.enabledModules;

    // ── Authorization: an owner may NOT self-grant paid add-ons or the platform
    // console. Paid add-ons (MODULES[k].default === false) are unlocked only
    // through billing (an active ModuleSubscription) or by a platform operator;
    // `superadmin` is never self-serviceable from a tenant. This endpoint is for
    // toggling base-plan modules and turning OFF things you no longer want.
    const isPaidAddon = (k) => MODULES[k]?.default === false;

    // superadmin is platform-operator-only — reject outright.
    if (requested.includes('superadmin')) {
      return res.status(403).json({
        type: 'https://balanzify.com/errors/forbidden',
        title: 'Cannot self-grant the platform console',
        status: 403,
        detail: 'The superadmin module is granted by a Balanzify platform operator, not from your account.',
      });
    }

    // What paid add-ons is this business actually entitled to keep/enable?
    const [biz, subs] = await Promise.all([
      prisma.business.findUnique({ where: { id: req.user.business_id }, select: { enabledModules: true } }),
      prisma.moduleSubscription.findMany({
        where: { businessId: req.user.business_id, status: 'active' },
        select: { module: true },
      }),
    ]);
    const currentlyEnabled = new Set(biz?.enabledModules || []);
    const subscribed = new Set(subs.map((s) => s.module));
    const entitled = (k) => currentlyEnabled.has(k) || subscribed.has(k);

    // Any requested paid add-on that isn't already enabled or actively subscribed
    // is a self-grant attempt — block it.
    const unauthorized = requested.filter((k) => isPaidAddon(k) && !entitled(k));
    if (unauthorized.length) {
      return res.status(402).json({
        type: 'https://balanzify.com/errors/payment-required',
        title: 'Add-on requires an active subscription',
        status: 402,
        modules: unauthorized,
        detail: `These modules are paid add-ons and must be activated through billing: ${unauthorized.join(', ')}.`,
      });
    }

    await prisma.business.update({
      where: { id: req.user.business_id },
      data: { enabledModules: requested },
    });
    requireModule.invalidate(req.user.business_id);
    const enabled = resolveEnabled(requested);
    res.json({ licensed: requested, effective: [...enabled] });
  } catch (err) { next(err); }
});

router.get('/market', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: { market: true },
    });
    res.json(getMarket(biz?.market));
  } catch (err) { next(err); }
});

router.put('/market', auth, requireRole('owner'), validate(z.object({
  market: z.enum(Object.keys(MARKETS)),
})), async (req, res, next) => {
  try {
    await prisma.business.update({
      where: { id: req.user.business_id },
      data: { market: req.body.market },
    });

    await ensureMarketTaxRate(req.user.business_id, req.body.market);

    res.json(getMarket(req.body.market));
  } catch (err) { next(err); }
});

module.exports = router;
