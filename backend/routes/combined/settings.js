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

// ── SETTINGS ──────────────────────────────────────────────────────────────────
const settingsRouter = express.Router();

settingsRouter.get('/', auth, async (req, res, next) => {
  try {
    // Whitelist the fields returned — never leak internal columns
    // (enabledModules, market flags, billing linkage, raw timestamps).
    const biz = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: {
        id: true, name: true, phone: true, address: true, city: true, country: true,
        currency: true, receiptHeader: true, receiptFooter: true, taxNumber: true, language: true,
      },
    });
    res.json(biz);
  } catch (err) { next(err); }
});

settingsRouter.put('/', auth, requireRole('owner'), validate(SettingsSchema), async (req, res, next) => {
  try {
    const biz = await prisma.business.update({
      where: { id: req.user.business_id },
      data: { name: req.body.name, phone: req.body.phone, address: req.body.address, city: req.body.city, country: req.body.country, currency: req.body.currency, receiptHeader: req.body.receipt_header, receiptFooter: req.body.receipt_footer, taxNumber: req.body.tax_number, ...(req.body.language !== undefined && { language: req.body.language }) },
    });
    res.json(biz);
  } catch (err) { next(err); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
const notificationsRouter = express.Router();

notificationsRouter.get('/', auth, async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { businessId: req.user.business_id, OR: [{ userId: req.user.id }, { userId: null }] },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    res.json({ notifications });
  } catch (err) { next(err); }
});

notificationsRouter.put('/:id/read', auth, async (req, res, next) => {
  try {
    // Tenant isolation: only notifications belonging to this business and
    // addressed to this user (or broadcast) can be marked read.
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id, OR: [{ userId: req.user.id }, { userId: null }] },
      data: { isRead: true },
    });
    if (result.count === 0) return res.status(404).json({ title: 'Notification not found', status: 404 });
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
});

notificationsRouter.put('/read-all', auth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { businessId: req.user.business_id, userId: req.user.id }, data: { isRead: true } });
    res.json({ message: 'All marked as read.' });
  } catch (err) { next(err); }
});


module.exports = { settingsRouter, notificationsRouter };
