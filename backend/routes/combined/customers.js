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
const { badAssignee } = require('./_shared');

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
const customersRouter = express.Router();

customersRouter.get('/', auth, async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { customerGroup: { select: { name: true, discountPct: true } }, assignedTo: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ customers });
  } catch (err) { next(err); }
});

customersRouter.post('/', auth, validate(CustomerSchema), async (req, res, next) => {
  try {
    const bad = await badAssignee(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    // A new customer inherits the business's default credit limit unless the
    // form set one explicitly (Business Settings → Contact).
    let creditLimit = req.body.credit_limit;
    if (creditLimit === undefined || creditLimit === null || creditLimit === '') {
      const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { settings: true } });
      const dflt = biz && biz.settings && biz.settings.default_credit_limit;
      creditLimit = dflt != null ? Number(dflt) : 0;
    }
    const customer = await prisma.customer.create({ data: { businessId: req.user.business_id, name: req.body.name, phone: req.body.phone, whatsapp: req.body.whatsapp, email: req.body.email, taxNumber: req.body.tax_number || null, address: req.body.address, creditLimit, customValues: req.body.custom_values || undefined, customerGroupId: req.body.customer_group_id || null, priceGroupId: req.body.price_group_id || null, ...(req.body.wholesale_terms_days !== undefined && { wholesaleTermsDays: req.body.wholesale_terms_days }), ...(req.body.contact_kind && { contactKind: req.body.contact_kind }), assignedToId: req.body.assigned_to_id || null, ...(req.body.opening_balance !== undefined && { openingBalance: req.body.opening_balance, outstandingBalance: req.body.opening_balance }), notes: req.body.notes } });
    res.status(201).json(customer);
  } catch (err) { next(err); }
});

customersRouter.put('/:id', auth, validate(CustomerSchema.partial()), async (req, res, next) => {
  try {
    const bad = await badAssignee(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    // Editing the opening balance shifts the outstanding by the delta so the
    // existing deyn/credit ledger stays intact.
    let obPatch = {};
    if (req.body.opening_balance !== undefined) {
      const existing = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { openingBalance: true } });
      if (!existing) return res.status(404).json({ title: 'Customer not found', status: 404 });
      obPatch = { openingBalance: req.body.opening_balance, outstandingBalance: { increment: req.body.opening_balance - parseFloat(existing.openingBalance || 0) } };
    }
    // Tenant isolation: scope the update to the caller's business.
    const result = await prisma.customer.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { name: req.body.name, phone: req.body.phone, whatsapp: req.body.whatsapp, email: req.body.email, ...(req.body.tax_number !== undefined && { taxNumber: req.body.tax_number || null }), address: req.body.address, ...(req.body.credit_limit !== undefined && { creditLimit: req.body.credit_limit }), ...(req.body.custom_values !== undefined && { customValues: req.body.custom_values }), customerGroupId: req.body.customer_group_id, ...(req.body.price_group_id !== undefined && { priceGroupId: req.body.price_group_id }), ...(req.body.wholesale_terms_days !== undefined && { wholesaleTermsDays: req.body.wholesale_terms_days }), ...(req.body.contact_kind !== undefined && { contactKind: req.body.contact_kind }), ...(req.body.assigned_to_id !== undefined && { assignedToId: req.body.assigned_to_id || null }), ...obPatch, notes: req.body.notes },
    });
    if (result.count === 0) return res.status(404).json({ title: 'Customer not found', status: 404 });
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
    res.json(customer);
  } catch (err) { next(err); }
});

customersRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { sales: { orderBy: { createdAt: 'desc' }, take: 20, select: { saleNumber: true, totalAmount: true, paymentMethod: true, createdAt: true, status: true } } },
    });
    if (!customer || customer.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(customer);
  } catch (err) { next(err); }
});


module.exports = { customersRouter };
