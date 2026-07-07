const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
  ExpenseSchema, ExpenseCategorySchema,
  PaymentAccountSchema, AccountTransferSchema, AccountDepositSchema,
  CustomerGroupSchema, UnitSchema, BrandSchema, VariationTemplateSchema, DiscountSchema,
  PriceGroupSchema, InvoiceLayoutSchema, InvoiceSchemeSchema, CommissionSettingsSchema,
  ServiceTypeSchema,
} = require('../../validation/schemas');
const { trackLogin } = require('../../lib/metrics');

// ── PRODUCT REFERENCE DATA: units / brands / variation templates ──────────────
const unitsRouter = express.Router();

// A "multiple" unit must reference a base unit in the same business (and not itself).
async function badUnitBase(b, businessId, selfId) {
  if (b.base_unit_id === undefined) return null;
  if (!b.base_unit_id) return null; // clearing
  if (selfId && b.base_unit_id === selfId) return 'A unit cannot be a multiple of itself';
  if (!(await prisma.unit.count({ where: { id: b.base_unit_id, businessId } }))) return 'Base unit not found';
  if (!b.base_multiplier || b.base_multiplier <= 0) return 'Enter how many base units this unit equals';
  return null;
}

unitsRouter.get('/', auth, async (req, res, next) => {
  try {
    const units = await prisma.unit.findMany({
      where: { businessId: req.user.business_id },
      orderBy: { actualName: 'asc' },
      include: { baseUnit: { select: { actualName: true, shortName: true } } },
    });
    res.json({ units });
  } catch (err) { next(err); }
});
unitsRouter.post('/', auth, requireRole('owner', 'manager'), validate(UnitSchema), async (req, res, next) => {
  try {
    const bad = await badUnitBase(req.body, req.user.business_id, null);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const unit = await prisma.unit.create({ data: {
      businessId: req.user.business_id, actualName: req.body.actual_name, shortName: req.body.short_name,
      allowDecimal: req.body.allow_decimal || false,
      baseUnitId: req.body.base_unit_id || null,
      baseMultiplier: req.body.base_unit_id ? req.body.base_multiplier : null,
    } });
    res.status(201).json(unit);
  } catch (err) { next(err); }
});
unitsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(UnitSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.unit.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const bad = await badUnitBase(req.body, req.user.business_id, req.params.id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const { actual_name, short_name, allow_decimal, base_unit_id, base_multiplier } = req.body;
    const unit = await prisma.unit.update({ where: { id: req.params.id }, data: {
      ...(actual_name   !== undefined && { actualName: actual_name }),
      ...(short_name    !== undefined && { shortName: short_name }),
      ...(allow_decimal !== undefined && { allowDecimal: allow_decimal }),
      ...(base_unit_id  !== undefined && { baseUnitId: base_unit_id || null, baseMultiplier: base_unit_id ? base_multiplier : null }),
    }});
    res.json(unit);
  } catch (err) { next(err); }
});
unitsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const u = await prisma.unit.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!u) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.unit.delete({ where: { id: req.params.id } });
    res.json({ message: 'Unit removed.' });
  } catch (err) { next(err); }
});

const brandsRouter = express.Router();

brandsRouter.get('/', auth, async (req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({
      where: { businessId: req.user.business_id },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ brands });
  } catch (err) { next(err); }
});
brandsRouter.post('/', auth, requireRole('owner', 'manager'), validate(BrandSchema), async (req, res, next) => {
  try {
    const brand = await prisma.brand.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name, description: req.body.description || null, useForRepair: req.body.use_for_repair || false },
      update: { description: req.body.description || null, ...(req.body.use_for_repair !== undefined && { useForRepair: req.body.use_for_repair }) },
    });
    res.status(201).json(brand);
  } catch (err) { next(err); }
});
brandsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(BrandSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.brand.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const brand = await prisma.brand.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.name !== undefined && { name: req.body.name }),
        ...(req.body.description !== undefined && { description: req.body.description || null }),
        ...(req.body.use_for_repair !== undefined && { useForRepair: req.body.use_for_repair }),
      },
    });
    res.json(brand);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ title: 'A brand with that name already exists', status: 409 });
    next(err);
  }
});
brandsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const b = await prisma.brand.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!b) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.brand.delete({ where: { id: req.params.id } });  // FK sets products.brand_id NULL
    res.json({ message: 'Brand removed.' });
  } catch (err) { next(err); }
});

const variationsRouter = express.Router();

variationsRouter.get('/', auth, async (req, res, next) => {
  try {
    const variations = await prisma.variationTemplate.findMany({ where: { businessId: req.user.business_id }, orderBy: { name: 'asc' } });
    res.json({ variations });
  } catch (err) { next(err); }
});
variationsRouter.post('/', auth, requireRole('owner', 'manager'), validate(VariationTemplateSchema), async (req, res, next) => {
  try {
    const variation = await prisma.variationTemplate.create({ data: { businessId: req.user.business_id, name: req.body.name, values: req.body.values || [] } });
    res.status(201).json(variation);
  } catch (err) { next(err); }
});
variationsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const v = await prisma.variationTemplate.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!v) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.variationTemplate.delete({ where: { id: req.params.id } });
    res.json({ message: 'Variation removed.' });
  } catch (err) { next(err); }
});


module.exports = { unitsRouter, brandsRouter, variationsRouter };
