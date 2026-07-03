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

// ── CUSTOMER GROUPS ───────────────────────────────────────────────────────────
const customerGroupsRouter = express.Router();

customerGroupsRouter.get('/', auth, async (req, res, next) => {
  try {
    const groups = await prisma.customerGroup.findMany({
      where: { businessId: req.user.business_id },
      include: { _count: { select: { customers: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ groups });
  } catch (err) { next(err); }
});

customerGroupsRouter.post('/', auth, requireRole('owner', 'manager'), validate(CustomerGroupSchema), async (req, res, next) => {
  try {
    const group = await prisma.customerGroup.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name, discountPct: req.body.amount || 0 },
      update: { discountPct: req.body.amount || 0 },
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});

customerGroupsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const grp = await prisma.customerGroup.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!grp) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.customerGroup.delete({ where: { id: req.params.id } });  // FK sets customers.customer_group_id NULL
    res.json({ message: 'Group removed.' });
  } catch (err) { next(err); }
});


module.exports = { customerGroupsRouter };
