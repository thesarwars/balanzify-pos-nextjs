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
        enabled: enabled.has(m.key),
      })),
      plan: {
        licensed: biz?.enabledModules?.length ? biz.enabledModules : ['(full suite)'],
        effective: [...enabled],
      },
    });
  } catch (err) { next(err); }
});

router.put('/', auth, requireRole('owner'), validate(z.object({
  enabledModules: z.array(z.enum(Object.keys(MODULES))).max(20),
})), async (req, res, next) => {
  try {
    await prisma.business.update({
      where: { id: req.user.business_id },
      data: { enabledModules: req.body.enabledModules },
    });
    requireModule.invalidate(req.user.business_id);
    const enabled = resolveEnabled(req.body.enabledModules);
    res.json({ licensed: req.body.enabledModules, effective: [...enabled] });
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
