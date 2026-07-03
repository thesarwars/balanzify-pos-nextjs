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

categoriesRouter.get('/', auth, async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { businessId: req.user.business_id },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
});

categoriesRouter.post('/', auth, requireRole('owner', 'manager'), validate(require('../../validation/schemas').CategorySchema), async (req, res, next) => {
  try {
    const cat = await prisma.category.create({ data: { businessId: req.user.business_id, name: req.body.name, description: req.body.description, color: req.body.color } });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

categoriesRouter.put('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    // Tenant isolation: scope the update to the caller's business.
    const result = await prisma.category.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { name: req.body.name, description: req.body.description, color: req.body.color },
    });
    if (result.count === 0) return res.status(404).json({ title: 'Category not found', status: 404 });
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
    res.json(cat);
  } catch (err) { next(err); }
});


module.exports = { categoriesRouter };
