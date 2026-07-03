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

// ── Supplier ledger ────────────────────────────────────────────────────────────
// Composed from what already exists: opening balance + received POs (credit —
// what we owe grows) + PO payments (debit). Includes an account summary and an
// AP aging report (due date = PO date + payment terms).
suppliersRouter.get('/:id/ledger', auth, async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!supplier) return res.status(404).json({ title: 'Not found', status: 404 });

    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
    const to   = req.query.to   ? new Date(req.query.to + 'T23:59:59') : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);
    const locFilter = req.query.location_id ? { locationId: req.query.location_id } : {};

    const pos = await prisma.purchaseOrder.findMany({
      where: { supplierId: supplier.id, businessId: req.user.business_id, status: { in: ['received', 'partial'] }, ...locFilter },
      include: { payments: { orderBy: { createdAt: 'asc' } }, location: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Build entries (purchases = credit, payments = debit), then filter to range.
    const raw = [];
    for (const po of pos) {
      raw.push({ date: po.createdAt, type: 'purchase', reference: po.poNumber, location: po.location?.name || '', method: null, debit: 0, credit: Number(po.totalAmount || 0), payment_status: po.paymentStatus });
      for (const p of po.payments) {
        raw.push({ date: p.createdAt, type: 'payment', reference: p.reference || po.poNumber, location: po.location?.name || '', method: p.paymentMethod || null, debit: Number(p.amount || 0), credit: 0, payment_status: null });
      }
    }
    raw.sort((a, b) => new Date(a.date) - new Date(b.date));

    let balance = Number(supplier.openingBalance || 0);
    const entries = [{ date: from, type: 'opening_balance', reference: null, location: '', method: null, debit: 0, credit: Number(supplier.openingBalance || 0), balance }];
    let totalPurchase = 0, totalPaid = 0;
    for (const e of raw) {
      balance += e.credit - e.debit;
      if (e.date >= from && e.date <= to) {
        if (e.type === 'purchase') totalPurchase += e.credit;
        if (e.type === 'payment') totalPaid += e.debit;
        entries.push({ ...e, balance: +balance.toFixed(2) });
      }
    }

    // AP aging on open POs (due = created + payment terms).
    const now = new Date();
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    for (const po of pos) {
      const due = Number(po.totalAmount || 0) - Number(po.amountPaid || 0);
      if (due <= 0.005) continue;
      const dueDate = new Date(po.createdAt); dueDate.setDate(dueDate.getDate() + (po.paymentTerms || 0));
      const daysPast = Math.floor((now - dueDate) / 86400000);
      if (daysPast <= 0) aging.current += due;
      else if (daysPast <= 30) aging.d1_30 += due;
      else if (daysPast <= 60) aging.d31_60 += due;
      else if (daysPast <= 90) aging.d61_90 += due;
      else aging.d90_plus += due;
    }
    Object.keys(aging).forEach((k) => { aging[k] = +aging[k].toFixed(2); });

    res.json({
      supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone, address: supplier.address, email: supplier.email },
      summary: {
        opening_balance: Number(supplier.openingBalance || 0),
        total_purchase: +totalPurchase.toFixed(2),
        total_paid: +totalPaid.toFixed(2),
        advance_balance: 0,
        balance_due: Number(supplier.outstandingBalance || 0),
      },
      entries,
      aging: { ...aging, total: +(aging.current + aging.d1_30 + aging.d31_60 + aging.d61_90 + aging.d90_plus).toFixed(2) },
    });
  } catch (err) { next(err); }
});

// ── Supplier stock report ──────────────────────────────────────────────────────
// What this supplier has supplied (received PO lines, converted to base units)
// joined with current stock. Sold/transferred/returned per-supplier need
// dedicated tracking — returned as null for the UI to render as pending.
suppliersRouter.get('/:id/stock-report', auth, async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true } });
    if (!supplier) return res.status(404).json({ title: 'Not found', status: 404 });

    const items = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { supplierId: supplier.id, businessId: req.user.business_id, status: { in: ['received', 'partial'] } } },
      include: {
        unit: { select: { baseUnitId: true, baseMultiplier: true } },
        product: { select: { id: true, name: true, sku: true, costPrice: true, stockLevels: { select: { quantity: true, locationId: true } } } },
      },
    });

    const byProduct = new Map();
    for (const it of items) {
      if (!it.product) continue;
      const mult = it.unit && it.unit.baseUnitId && it.unit.baseMultiplier ? Number(it.unit.baseMultiplier) : 1;
      const key = it.product.id;
      if (!byProduct.has(key)) {
        const levels = req.query.location_id
          ? it.product.stockLevels.filter((sl) => String(sl.locationId) === String(req.query.location_id))
          : it.product.stockLevels;
        const stock = levels.reduce((s, sl) => s + (sl.quantity || 0), 0);
        byProduct.set(key, {
          product_id: key, product: it.product.name, sku: it.product.sku || '',
          purchase_quantity: 0, total_sold: null, total_transferred: null, total_returned: null,
          current_stock: stock, current_stock_value: +(stock * Number(it.product.costPrice || 0)).toFixed(2),
        });
      }
      byProduct.get(key).purchase_quantity += Math.round((it.receivedQty || 0) * mult);
    }
    res.json({ rows: [...byProduct.values()] });
  } catch (err) { next(err); }
});

module.exports = { suppliersRouter };
