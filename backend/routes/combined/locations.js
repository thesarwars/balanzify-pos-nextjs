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

// ── LOCATIONS ─────────────────────────────────────────────────────────────────
const locationsRouter = express.Router();

// Manager, invoice scheme/layout, price group and product names shown on the card.
const LOCATION_INCLUDE = {
  manager:       { select: { id: true, name: true } },
  invoiceScheme: { select: { id: true, name: true } },
  invoiceLayout: { select: { id: true, name: true } },
  priceGroup:    { select: { id: true, name: true } },
};

// Map a validated location body (snake_case API) to Prisma data (camelCase),
// only for keys actually present so PUT stays partial. '' clears a value.
function locationDataFromBody(b) {
  const data = {};
  const scalars = {
    name: 'name', type: 'type', address: 'address',
    location_code: 'locationCode', landmark: 'landmark', city: 'city', zip_code: 'zipCode',
    state: 'state', country: 'country', mobile: 'mobile', alt_contact: 'altContact',
    email: 'email', website: 'website', default_payment: 'defaultPayment',
    custom_field1: 'customField1', custom_field2: 'customField2',
    custom_field3: 'customField3', custom_field4: 'customField4',
  };
  for (const [k, col] of Object.entries(scalars)) {
    if (b[k] !== undefined) data[col] = b[k] === '' ? null : b[k];
  }
  const fks = { manager_id: 'managerId', invoice_scheme_id: 'invoiceSchemeId', invoice_layout_id: 'invoiceLayoutId', price_group_id: 'priceGroupId' };
  for (const [k, col] of Object.entries(fks)) {
    if (b[k] !== undefined) data[col] = b[k] || null;
  }
  if (b.is_active !== undefined) data.isActive = b.is_active;
  if (b.featured_product_ids !== undefined) data.featuredProductIds = b.featured_product_ids || [];
  if (b.payment_methods !== undefined) data.paymentMethods = b.payment_methods || [];
  if (b.payment_accounts !== undefined) data.paymentAccounts = b.payment_accounts || null;
  return data;
}

// Defence-in-depth beyond the FKs: reject references that belong to another
// tenant. Returns an error message, or null when everything checks out.
async function invalidLocationRef(b, businessId) {
  for (const [id, model, label] of [
    [b.manager_id, 'user', 'Manager'],
    [b.invoice_scheme_id, 'invoiceScheme', 'Invoice scheme'],
    [b.invoice_layout_id, 'invoiceLayout', 'Invoice layout'],
    [b.price_group_id, 'priceGroup', 'Price group'],
  ]) {
    if (id && !(await prisma[model].count({ where: { id, businessId } }))) return `${label} not found`;
  }
  const feat = Array.isArray(b.featured_product_ids) ? [...new Set(b.featured_product_ids)] : [];
  if (feat.length && (await prisma.product.count({ where: { id: { in: feat }, businessId } })) !== feat.length) {
    return 'One or more featured products not found';
  }
  const accts = b.payment_accounts ? [...new Set(Object.values(b.payment_accounts).filter(Boolean))] : [];
  if (accts.length && (await prisma.paymentAccount.count({ where: { id: { in: accts }, businessId } })) !== accts.length) {
    return 'One or more payment accounts not found';
  }
  return null;
}

locationsRouter.get('/', auth, async (req, res, next) => {
  try {
    // `?all=1` includes disabled locations (management screen); default = active only.
    const includeInactive = ['1', 'true'].includes(String(req.query.all));
    const locations = await prisma.location.findMany({
      where: { businessId: req.user.business_id, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      include: LOCATION_INCLUDE,
    });
    res.json({ locations });
  } catch (err) { next(err); }
});

locationsRouter.post('/', auth, requireRole('owner', 'manager'), validate(LocationSchema), async (req, res, next) => {
  try {
    const bad = await invalidLocationRef(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const loc = await prisma.location.create({
      data: { businessId: req.user.business_id, ...locationDataFromBody(req.body) },
      include: LOCATION_INCLUDE,
    });
    res.status(201).json(loc);
  } catch (err) { next(err); }
});

locationsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(LocationSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.location.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const bad = await invalidLocationRef(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const loc = await prisma.location.update({
      where: { id: req.params.id },
      data: locationDataFromBody(req.body),
      include: LOCATION_INCLUDE,
    });
    res.json(loc);
  } catch (err) { next(err); }
});


module.exports = { locationsRouter };
