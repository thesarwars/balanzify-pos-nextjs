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

// ── DISCOUNTS ─────────────────────────────────────────────────────────────────
const discountsRouter = express.Router();

function mapDiscount(b) {
  const m = {};
  if (b.name        !== undefined) m.name = b.name;
  if (b.type        !== undefined) m.type = b.type;
  if (b.value       !== undefined) m.value = b.value;
  if (b.priority    !== undefined) m.priority = b.priority;
  if (b.category    !== undefined) m.category = b.category || null;
  if (b.brand_id    !== undefined) m.brandId = b.brand_id || null;
  if (b.location_id !== undefined) m.locationId = b.location_id || null;
  if (b.starts_at   !== undefined) m.startsAt = b.starts_at ? new Date(b.starts_at) : null;
  if (b.ends_at     !== undefined) m.endsAt = b.ends_at ? new Date(b.ends_at) : null;
  if (b.apply_price_groups    !== undefined) m.applyPriceGroups = b.apply_price_groups;
  if (b.apply_customer_groups !== undefined) m.applyCustomerGroups = b.apply_customer_groups;
  if (b.is_active   !== undefined) m.isActive = b.is_active;
  return m;
}
const discountInclude = { brand: { select: { name: true } }, location: { select: { name: true } } };

discountsRouter.get('/', auth, async (req, res, next) => {
  try {
    const discounts = await prisma.discount.findMany({
      where: { businessId: req.user.business_id },
      include: discountInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ discounts });
  } catch (err) { next(err); }
});
discountsRouter.post('/', auth, requireRole('owner', 'manager'), validate(DiscountSchema), async (req, res, next) => {
  try {
    const discount = await prisma.discount.create({ data: { businessId: req.user.business_id, ...mapDiscount(req.body) }, include: discountInclude });
    res.status(201).json(discount);
  } catch (err) { next(err); }
});
discountsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(DiscountSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.discount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const discount = await prisma.discount.update({ where: { id: req.params.id }, data: mapDiscount(req.body), include: discountInclude });
    res.json(discount);
  } catch (err) { next(err); }
});
discountsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const d = await prisma.discount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!d) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.discount.delete({ where: { id: req.params.id } });
    res.json({ message: 'Discount deleted.' });
  } catch (err) { next(err); }
});

// ── PRICE GROUPS ──────────────────────────────────────────────────────────────
const priceGroupsRouter = express.Router();

priceGroupsRouter.get('/', auth, async (req, res, next) => {
  try {
    const priceGroups = await prisma.priceGroup.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json({ priceGroups });
  } catch (err) { next(err); }
});
priceGroupsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PriceGroupSchema), async (req, res, next) => {
  try {
    const group = await prisma.priceGroup.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name, percent: req.body.percent || 0 },
      update: { percent: req.body.percent || 0 },
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});
priceGroupsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const g = await prisma.priceGroup.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!g) return res.status(404).json({ title: 'Not found', status: 404 });
    if (g.isDefault) return res.status(422).json({ title: 'The default price group cannot be deleted.', status: 422 });
    await prisma.priceGroup.delete({ where: { id: req.params.id } });
    res.json({ message: 'Price group removed.' });
  } catch (err) { next(err); }
});


module.exports = { discountsRouter, priceGroupsRouter };
