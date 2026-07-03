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

// ── SUPPLIERS ────────────────────────────────────────────────────────────────
const suppliersRouter = express.Router();

suppliersRouter.get('/', auth, async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { _count: { select: { purchaseOrders: true, products: true } }, assignedTo: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ suppliers });
  } catch (err) { next(err); }
});

suppliersRouter.post('/', auth, requireRole('owner', 'manager'), validate(SupplierSchema), async (req, res, next) => {
  try {
    const bad = await badAssignee(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const supplier = await prisma.supplier.create({
      data: {
        businessId: req.user.business_id,
        ...mapSupplier(req.body),
        // Opening balance = what we already owe this supplier; it seeds the payable.
        ...(req.body.opening_balance !== undefined && { openingBalance: req.body.opening_balance, outstandingBalance: req.body.opening_balance }),
      },
    });
    res.status(201).json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(SupplierSchema.partial()), async (req, res, next) => {
  try {
    // Tenant isolation: the row must belong to the caller's business.
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const bad = await badAssignee(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    // Editing the opening balance shifts the outstanding payable by the delta,
    // so payments/receipts already on the ledger stay intact.
    const obDelta = req.body.opening_balance !== undefined ? req.body.opening_balance - parseFloat(existing.openingBalance || 0) : 0;
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: {
        ...mapSupplier(req.body),
        ...(req.body.opening_balance !== undefined && { openingBalance: req.body.opening_balance, outstandingBalance: { increment: obDelta } }),
      },
    });
    res.json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        products: { include: { product: { select: { name: true, sku: true } } } },
        communications: { orderBy: { createdAt: 'desc' }, take: 20 },
        purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!supplier || supplier.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.post('/:id/communications', auth, validate(SupplierCommSchema), async (req, res, next) => {
  try {
    const comm = await prisma.supplierCommunication.create({
      data: { supplierId: req.params.id, ...req.body, createdById: req.user.id },
    });
    res.status(201).json(comm);
  } catch (err) { next(err); }
});

suppliersRouter.post('/:id/products', auth, requireRole('owner', 'manager'), validate(SupplierProductSchema), async (req, res, next) => {
  try {
    const sp = await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: req.params.id, productId: req.body.product_id } },
      create: { supplierId: req.params.id, productId: req.body.product_id, supplierSku: req.body.supplier_sku, unitPrice: req.body.unit_price, minOrderQty: req.body.min_order_qty || 1, leadTimeDays: req.body.lead_time_days || 0, isPreferred: req.body.is_preferred || false },
      update: { supplierSku: req.body.supplier_sku, unitPrice: req.body.unit_price, minOrderQty: req.body.min_order_qty || 1, leadTimeDays: req.body.lead_time_days || 0, isPreferred: req.body.is_preferred || false },
    });
    res.status(201).json(sp);
  } catch (err) { next(err); }
});

// Maps only the keys present in the request body so partial updates (PUT) don't
// reset untouched columns to their defaults. Prisma ignores undefined values.
function mapSupplier(b) {
  const m = {};
  if (b.name           !== undefined) m.name = b.name;
  if (b.contact_person !== undefined) m.contactPerson = b.contact_person;
  if (b.phone          !== undefined) m.phone = b.phone;
  if (b.whatsapp       !== undefined) m.whatsapp = b.whatsapp;
  if (b.email          !== undefined) m.email = b.email;
  if (b.country        !== undefined) m.country = b.country;
  if (b.city           !== undefined) m.city = b.city;
  if (b.address        !== undefined) m.address = b.address;
  if (b.payment_terms  !== undefined) m.paymentTerms = b.payment_terms;
  if (b.credit_limit   !== undefined) m.creditLimit = b.credit_limit;
  if (b.currency       !== undefined) m.currency = b.currency;
  if (b.rating         !== undefined) m.rating = b.rating;
  if (b.is_blacklisted !== undefined) m.isBlacklisted = b.is_blacklisted;
  if (b.blacklist_reason !== undefined) m.blacklistReason = b.blacklist_reason;
  if (b.is_active      !== undefined) m.isActive = b.is_active;
  if (b.contact_kind   !== undefined) m.contactKind = b.contact_kind;
  if (b.assigned_to_id !== undefined) m.assignedToId = b.assigned_to_id || null;
  if (b.notes          !== undefined) m.notes = b.notes;
  return m;
}

module.exports = { suppliersRouter };
