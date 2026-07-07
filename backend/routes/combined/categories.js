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

// ── CATEGORIES ────────────────────────────────────────────────────────────────
const categoriesRouter = express.Router();

// The parent category must belong to this business and not be the row itself.
async function badParent(parentId, businessId, selfId) {
  if (!parentId) return null;
  if (selfId && parentId === selfId) return 'A category cannot be its own parent';
  return (await prisma.category.count({ where: { id: parentId, businessId } })) ? null : 'Parent category not found';
}

categoriesRouter.get('/', auth, async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { businessId: req.user.business_id },
      include: { _count: { select: { products: true, children: true } }, parent: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
});

categoriesRouter.post('/', auth, requireRole('owner', 'manager'), validate(CategorySchema), async (req, res, next) => {
  try {
    const bad = await badParent(req.body.parent_id, req.user.business_id, null);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const cat = await prisma.category.create({ data: {
      businessId: req.user.business_id,
      name: req.body.name, code: req.body.code || null, description: req.body.description || null,
      color: req.body.color || null, parentId: req.body.parent_id || null,
    } });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

categoriesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(CategorySchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Category not found', status: 404 });
    const bad = await badParent(req.body.parent_id, req.user.business_id, req.params.id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const cat = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.name        !== undefined && { name: req.body.name }),
        ...(req.body.code        !== undefined && { code: req.body.code || null }),
        ...(req.body.description !== undefined && { description: req.body.description || null }),
        ...(req.body.color       !== undefined && { color: req.body.color || null }),
        ...(req.body.parent_id   !== undefined && { parentId: req.body.parent_id || null }),
      },
    });
    res.json(cat);
  } catch (err) { next(err); }
});

categoriesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!existing) return res.status(404).json({ title: 'Category not found', status: 404 });
    // Products fall back to no category and children become top-level (FK SetNull).
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ message: 'Category deleted.' });
  } catch (err) { next(err); }
});

module.exports = { categoriesRouter };
