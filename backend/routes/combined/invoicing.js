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

// ── INVOICE LAYOUTS & SCHEMES ─────────────────────────────────────────────────
const invoiceLayoutsRouter = express.Router();

function mapInvoiceLayout(b) {
  const m = {};
  if (b.name                !== undefined) m.name = b.name;
  if (b.design              !== undefined) m.design = b.design;
  if (b.header_text         !== undefined) m.headerText = b.header_text;
  if (b.footer_text         !== undefined) m.footerText = b.footer_text;
  if (b.show_address        !== undefined) m.showAddress = b.show_address;
  if (b.show_tax_summary    !== undefined) m.showTaxSummary = b.show_tax_summary;
  if (b.show_total_in_words !== undefined) m.showTotalInWords = b.show_total_in_words;
  if (b.show_discount       !== undefined) m.showDiscount = b.show_discount;
  if (b.show_qr             !== undefined) m.showQr = b.show_qr;
  if (b.show_letterhead     !== undefined) m.showLetterhead = b.show_letterhead;
  if (b.hide_prices         !== undefined) m.hidePrices = b.hide_prices;
  if (b.is_default          !== undefined) m.isDefault = b.is_default;
  if (b.config              !== undefined) m.config = b.config;
  return m;
}

invoiceLayoutsRouter.get('/', auth, async (req, res, next) => {
  try {
    const layouts = await prisma.invoiceLayout.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ layouts });
  } catch (err) { next(err); }
});
invoiceLayoutsRouter.post('/', auth, requireRole('owner', 'manager'), validate(InvoiceLayoutSchema), async (req, res, next) => {
  try {
    const count = await prisma.invoiceLayout.count({ where: { businessId: req.user.business_id } });
    const layout = await prisma.invoiceLayout.create({
      data: { businessId: req.user.business_id, ...mapInvoiceLayout(req.body), ...(count === 0 && { isDefault: true }) },
    });
    res.status(201).json(layout);
  } catch (err) { next(err); }
});
invoiceLayoutsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(InvoiceLayoutSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.invoiceLayout.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (req.body.is_default === true) {
      await prisma.invoiceLayout.updateMany({ where: { businessId: req.user.business_id, isDefault: true, id: { not: req.params.id } }, data: { isDefault: false } });
    }
    const layout = await prisma.invoiceLayout.update({ where: { id: req.params.id }, data: mapInvoiceLayout(req.body) });
    res.json(layout);
  } catch (err) { next(err); }
});
invoiceLayoutsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const l = await prisma.invoiceLayout.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!l) return res.status(404).json({ title: 'Not found', status: 404 });
    if (l.isDefault) return res.status(422).json({ title: 'The default layout cannot be deleted.', status: 422 });
    await prisma.invoiceLayout.delete({ where: { id: req.params.id } });
    res.json({ message: 'Layout deleted.' });
  } catch (err) { next(err); }
});

const invoiceSchemesRouter = express.Router();

invoiceSchemesRouter.get('/', auth, async (req, res, next) => {
  try {
    const schemes = await prisma.invoiceScheme.findMany({ where: { businessId: req.user.business_id }, orderBy: { createdAt: 'asc' } });
    res.json({ schemes });
  } catch (err) { next(err); }
});
// Build Prisma data from a (possibly partial) validated scheme body.
function invoiceSchemeData(b) {
  const d = {};
  if (b.name          !== undefined) d.name = b.name;
  if (b.prefix        !== undefined) d.prefix = b.prefix || null;
  if (b.start_number  !== undefined) d.startNumber = b.start_number;
  if (b.total_digits  !== undefined) d.totalDigits = b.total_digits;
  if (b.numbering_type!== undefined) d.numberingType = b.numbering_type;
  if (b.include_year  !== undefined) d.includeYear = b.include_year;
  return d;
}

invoiceSchemesRouter.post('/', auth, requireRole('owner', 'manager'), validate(InvoiceSchemeSchema), async (req, res, next) => {
  try {
    const scheme = await prisma.invoiceScheme.create({ data: { businessId: req.user.business_id, ...invoiceSchemeData(req.body) } });
    res.status(201).json(scheme);
  } catch (err) { next(err); }
});
invoiceSchemesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(InvoiceSchemeSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.invoiceScheme.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const scheme = await prisma.invoiceScheme.update({ where: { id: req.params.id }, data: invoiceSchemeData(req.body) });
    res.json(scheme);
  } catch (err) { next(err); }
});
invoiceSchemesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const s = await prisma.invoiceScheme.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!s) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.invoiceScheme.delete({ where: { id: req.params.id } });
    res.json({ message: 'Scheme deleted.' });
  } catch (err) { next(err); }
});


module.exports = { invoiceLayoutsRouter, invoiceSchemesRouter };
