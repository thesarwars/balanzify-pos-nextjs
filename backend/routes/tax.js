/**
 * Tax Routes
 *
 * GET  /api/v1/tax/rates          — list all tax rates
 * POST /api/v1/tax/rates          — create a tax rate
 * PUT  /api/v1/tax/rates/:id      — update a tax rate
 * DELETE /api/v1/tax/rates/:id    — deactivate
 * GET  /api/v1/tax/rates/:id      — get one rate
 * POST /api/v1/tax/calculate      — calculate tax on a cart (preview)
 * GET  /api/v1/tax/report         — tax liability report
 */

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { computeTax } = require('../lib/tax');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const router = express.Router();

// The rest of the API takes snake_case request bodies; accept that (and tolerate
// camelCase) so `is_default`/`is_inclusive` actually register — previously they
// were silently dropped, so no default rate was ever set and tax came out 0.
const TaxRateSchema = z.object({
  name:         z.string().trim().min(1).max(100),
  rate:         z.coerce.number().min(0).max(1),       // 0.16 = 16%, not 16
  region:       z.string().trim().max(100).optional().nullable(),
  is_default:   z.boolean().optional(),
  is_inclusive: z.boolean().optional(),
  is_active:    z.boolean().optional(),
  for_tax_group_only: z.boolean().optional(),
  isDefault:    z.boolean().optional(),
  isInclusive:  z.boolean().optional(),
  isActive:     z.boolean().optional(),
});
// Coalesce either naming style into the canonical flags.
const taxFlags = (b) => ({
  isDefault:   b.is_default   ?? b.isDefault,
  isInclusive: b.is_inclusive ?? b.isInclusive,
  isActive:    b.is_active    ?? b.isActive,
});

// GET /api/v1/tax/rates
// GET /api/v1/tax/rates
// Default: the rates that may actually be picked on a product/purchase — active,
// not a group, and not a group-only component. (Deactivated rates used to leak
// into every picker.) `?all=1` returns every active rate for the Tax Rates
// screen and the group builder.
router.get('/rates', auth, async (req, res, next) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    const rates = await prisma.taxRate.findMany({
      where: {
        businessId: req.user.business_id,
        isActive: true,
        isTaxGroup: false,
        ...(all ? {} : { forTaxGroupOnly: false }),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    res.json({ rates });
  } catch (err) { next(err); }
});

// ── Tax groups ───────────────────────────────────────────────────────────────
// A group is a TaxRate with isTaxGroup=true whose `rate` is the sum of its
// components, so tax maths anywhere else needs no special case.
const TaxGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tax_rate_ids: z.array(z.string().uuid()).min(2, 'A tax group needs at least two taxes').max(10),
});

const groupInclude = { subTaxes: { include: { taxRate: { select: { id: true, name: true, rate: true } } } } };

/** Load + validate the components, and return their summed rate. */
async function loadSubTaxes(businessId, ids) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw Object.assign(new Error('The same tax cannot be added to a group twice.'), { statusCode: 400 });
  }
  const rates = await prisma.taxRate.findMany({ where: { id: { in: unique }, businessId, isActive: true } });
  if (rates.length !== unique.length) {
    throw Object.assign(new Error('One or more taxes were not found.'), { statusCode: 400 });
  }
  const group = rates.find((r) => r.isTaxGroup);
  if (group) {
    throw Object.assign(new Error(`"${group.name}" is itself a tax group and cannot be nested.`), { statusCode: 400 });
  }
  const total = rates.reduce((s, r) => s + parseFloat(r.rate), 0);
  return { rates, total: +total.toFixed(4) };
}

router.get('/groups', auth, async (req, res, next) => {
  try {
    const groups = await prisma.taxRate.findMany({
      where: { businessId: req.user.business_id, isTaxGroup: true, isActive: true },
      orderBy: { name: 'asc' },
      include: groupInclude,
    });
    res.json({ groups });
  } catch (err) { next(err); }
});

router.post('/groups', auth, requireRole('owner', 'manager'), validate(TaxGroupSchema), async (req, res, next) => {
  try {
    const { name, tax_rate_ids } = req.body;
    const { total } = await loadSubTaxes(req.user.business_id, tax_rate_ids);
    const group = await prisma.taxRate.create({
      data: {
        businessId: req.user.business_id, name, rate: total, isTaxGroup: true, isActive: true,
        subTaxes: { create: [...new Set(tax_rate_ids)].map((taxRateId) => ({ taxRateId })) },
      },
      include: groupInclude,
    });
    res.status(201).json(group);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    if (err.code === 'P2002') return res.status(409).json({ title: 'A tax with that name already exists', status: 409 });
    next(err);
  }
});

router.put('/groups/:id', auth, requireRole('owner', 'manager'), validate(TaxGroupSchema), async (req, res, next) => {
  try {
    const existing = await prisma.taxRate.findFirst({ where: { id: req.params.id, businessId: req.user.business_id, isTaxGroup: true } });
    if (!existing) return res.status(404).json({ title: 'Tax group not found', status: 404 });
    const { name, tax_rate_ids } = req.body;
    const ids = [...new Set(tax_rate_ids)];
    if (ids.includes(req.params.id)) {
      return res.status(400).json({ title: 'A tax group cannot contain itself.', status: 400 });
    }
    const { total } = await loadSubTaxes(req.user.business_id, tax_rate_ids);
    const group = await prisma.$transaction(async (tx) => {
      await tx.taxGroupSubTax.deleteMany({ where: { taxGroupId: req.params.id } });
      return tx.taxRate.update({
        where: { id: req.params.id },
        data: { name, rate: total, subTaxes: { create: ids.map((taxRateId) => ({ taxRateId })) } },
        include: groupInclude,
      });
    });
    res.json(group);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    if (err.code === 'P2002') return res.status(409).json({ title: 'A tax with that name already exists', status: 409 });
    next(err);
  }
});

router.delete('/groups/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.taxRate.findFirst({ where: { id: req.params.id, businessId: req.user.business_id, isTaxGroup: true } });
    if (!existing) return res.status(404).json({ title: 'Tax group not found', status: 404 });
    await prisma.taxRate.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Tax group deleted.' });
  } catch (err) { next(err); }
});

// GET /api/v1/tax/rates/:id
router.get('/rates/:id', auth, async (req, res, next) => {
  try {
    const rate = await prisma.taxRate.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { _count: { select: { products: true } } },
    });
    if (!rate) return res.status(404).json({ title: 'Tax rate not found', status: 404 });
    res.json(rate);
  } catch (err) { next(err); }
});

// POST /api/v1/tax/rates
router.post('/rates', auth, requireRole('owner', 'manager'), validate(TaxRateSchema), async (req, res, next) => {
  try {
    const { name, rate, region } = req.body;
    const f = taxFlags(req.body);
    const isDefault = f.isDefault ?? false, isInclusive = f.isInclusive ?? false, isActive = f.isActive ?? true;

    // If setting this as default, unset current default first
    if (isDefault) {
      await prisma.taxRate.updateMany({
        where: { businessId: req.user.business_id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const taxRate = await prisma.taxRate.create({
      data: { businessId: req.user.business_id, name, rate, region: region || null, isDefault, isInclusive, isActive,
              forTaxGroupOnly: !!req.body.for_tax_group_only },
    });
    res.status(201).json(taxRate);
  } catch (err) { next(err); }
});

// PUT /api/v1/tax/rates/:id
router.put('/rates/:id', auth, requireRole('owner', 'manager'), validate(TaxRateSchema.partial()), async (req, res, next) => {
  try {
    const { name, rate, region } = req.body;
    const { isDefault, isInclusive, isActive } = taxFlags(req.body);

    if (isDefault) {
      await prisma.taxRate.updateMany({
        where: { businessId: req.user.business_id, isDefault: true, id: { not: req.params.id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.taxRate.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: {
        ...(name        !== undefined && { name }),
        ...(rate        !== undefined && { rate }),
        ...(region      !== undefined && { region: region || null }),
        ...(isDefault   !== undefined && { isDefault }),
        ...(isInclusive !== undefined && { isInclusive }),
        ...(isActive    !== undefined && { isActive }),
        ...(req.body.for_tax_group_only !== undefined && { forTaxGroupOnly: req.body.for_tax_group_only }),
      },
    });
    if (!updated.count) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(await prisma.taxRate.findUnique({ where: { id: req.params.id } }));
  } catch (err) { next(err); }
});

// DELETE /api/v1/tax/rates/:id — deactivate only, never delete (audit trail)
router.delete('/rates/:id', auth, requireRole('owner'), async (req, res, next) => {
  try {
    // A group's rate is the sum of its components; removing one silently would
    // leave the group overstating its rate. Make the caller fix the group first.
    const usedBy = await prisma.taxGroupSubTax.findMany({
      where: { taxRateId: req.params.id, taxGroup: { businessId: req.user.business_id, isActive: true } },
      include: { taxGroup: { select: { name: true } } },
    });
    if (usedBy.length) {
      const names = usedBy.map((u) => u.taxGroup.name).join(', ');
      return res.status(409).json({ title: `This tax is part of the tax group${usedBy.length > 1 ? 's' : ''}: ${names}. Remove it from the group first.`, status: 409 });
    }
    const updated = await prisma.taxRate.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { isActive: false },
    });
    if (!updated.count) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json({ message: 'Tax rate deactivated.' });
  } catch (err) { next(err); }
});

// POST /api/v1/tax/calculate — preview tax on a cart before checkout
router.post('/calculate', auth, validate(z.object({
  items: z.array(z.object({
    product_id:   z.string().uuid().optional(),
    line_total:   z.coerce.number().nonnegative(),
    tax_rate_id:  z.string().uuid().optional().nullable(),
  })).min(1),
})), async (req, res, next) => {
  try {
    const items = req.body.items.map(i => ({ lineTotal: i.line_total, taxRateId: i.tax_rate_id || null }));
    const result = await computeTax(items, req.user.business_id);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/tax/report — tax liability report for accountants and tax authorities
router.get('/report', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1)); // default: this month
    const toDate   = to   ? new Date(new Date(to).setDate(new Date(to).getDate() + 1)) : new Date();

    // Total tax collected per rate
    const taxByRate = await prisma.$queryRaw`
      SELECT
        si.tax_rate_id,
        tr.name AS rate_name,
        tr.rate,
        tr.is_inclusive,
        COUNT(DISTINCT s.id)    AS transaction_count,
        SUM(si.total_price)     AS taxable_amount,
        SUM(si.tax_amount)      AS tax_collected
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN tax_rates tr ON si.tax_rate_id = tr.id
      WHERE s.business_id = ${req.user.business_id}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
        AND s.created_at <  ${toDate}
      GROUP BY si.tax_rate_id, tr.name, tr.rate, tr.is_inclusive
      ORDER BY tax_collected DESC
    `;

    // Total tax summary
    const summary = await prisma.sale.aggregate({
      where: {
        businessId: req.user.business_id,
        status: 'completed',
        createdAt: { gte: fromDate, lt: toDate },
      },
      _sum: { totalAmount: true, taxAmount: true },
      _count: { id: true },
    });

    res.json({
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      summary: {
        total_revenue:      parseFloat(summary._sum.totalAmount || 0),
        total_tax_collected: parseFloat(summary._sum.taxAmount  || 0),
        total_transactions:  summary._count.id,
        net_revenue:         parseFloat(summary._sum.totalAmount || 0) - parseFloat(summary._sum.taxAmount || 0),
      },
      by_rate: taxByRate.map(r => ({
        rate_id:           r.tax_rate_id,
        rate_name:         r.rate_name || 'No tax',
        rate_pct:          r.rate ? parseFloat(r.rate) * 100 : 0,
        is_inclusive:      r.is_inclusive,
        transactions:      parseInt(r.transaction_count),
        taxable_amount:    parseFloat(r.taxable_amount || 0),
        tax_collected:     parseFloat(r.tax_collected  || 0),
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
