const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { invalidateBusinessSettings } = require('../../lib/businessSettings');
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
        logoUrl: true, settings: true,
      },
    });
    res.json({ ...biz, settings: (biz && biz.settings) || {} });
  } catch (err) { next(err); }
});

settingsRouter.put('/', auth, requireRole('owner'), validate(SettingsSchema), async (req, res, next) => {
  try {
    const data = {
      name: req.body.name, phone: req.body.phone, address: req.body.address, city: req.body.city, country: req.body.country,
      currency: req.body.currency, receiptHeader: req.body.receipt_header, receiptFooter: req.body.receipt_footer,
      taxNumber: req.body.tax_number, ...(req.body.language !== undefined && { language: req.body.language }),
    };
    // Shallow-merge the settings bag so a partial save never drops other keys.
    if (req.body.settings && typeof req.body.settings === 'object') {
      const current = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { settings: true } });
      data.settings = { ...((current && current.settings) || {}), ...req.body.settings };
    }
    const biz = await prisma.business.update({ where: { id: req.user.business_id }, data });
    invalidateBusinessSettings(req.user.business_id);   // routes read the bag through a TTL cache
    res.json({ ...biz, settings: biz.settings || {} });
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



// ── SMS settings — secrets never leave the server unredacted ─────────────────
const sms = require('../../lib/sms');
const { z: zSms } = require('zod');

settingsRouter.get('/sms', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { smsConfig: true } });
    res.json({ config: sms.redact(biz && biz.smsConfig) });
  } catch (err) { next(err); }
});

const SmsConfigSchema = zSms.object({
  driver: zSms.enum(['africastalking', 'twilio', 'custom']),
  sender_id: zSms.string().trim().max(30).optional().nullable(),
  at_username: zSms.string().trim().max(100).optional().nullable(),
  at_api_key: zSms.string().trim().max(200).optional().nullable(),
  twilio_sid: zSms.string().trim().max(100).optional().nullable(),
  twilio_auth_token: zSms.string().trim().max(200).optional().nullable(),
  custom_url: zSms.string().trim().url().max(500).optional().nullable(),
  custom_method: zSms.enum(['POST', 'GET']).optional(),
  custom_body_type: zSms.enum(['form', 'json']).optional(),
  custom_to_param: zSms.string().trim().max(40).optional().nullable(),
  custom_msg_param: zSms.string().trim().max(40).optional().nullable(),
  custom_headers: zSms.string().trim().max(1000).optional().nullable(),
  custom_params: zSms.array(zSms.object({ key: zSms.string().max(40), value: zSms.string().max(200) })).max(10).optional(),
});

settingsRouter.put('/sms', auth, requireRole('owner'), validate(SmsConfigSchema), async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { smsConfig: true } });
    const merged = sms.mergeConfig(biz && biz.smsConfig, req.body);
    await prisma.business.update({ where: { id: req.user.business_id }, data: { smsConfig: merged } });
    res.json({ config: sms.redact(merged) });
  } catch (err) { next(err); }
});

settingsRouter.post('/sms/test', auth, requireRole('owner'), validate(zSms.object({ to: zSms.string().trim().min(5).max(30) })), async (req, res, next) => {
  try {
    await sms.sendSms(req.user.business_id, req.body.to, 'Balanzify test message — your SMS settings work.', req.user.id);
    res.json({ message: 'Test SMS sent.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ title: err.message, status: err.statusCode });
    next(err);
  }
});

// ── Custom field definitions — unlimited, per entity ─────────────────────────
const CF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CustomFieldSchema = zSms.object({
  entity: zSms.enum(['contact', 'product']),
  label: zSms.string().trim().min(1).max(100),
  field_type: zSms.enum(['text', 'number', 'date', 'select']).default('text'),
  options: zSms.array(zSms.string().trim().max(100)).max(50).optional().nullable(),
  required: zSms.boolean().optional(),
  sort_order: zSms.coerce.number().int().min(0).max(10000).optional(),
  is_active: zSms.boolean().optional(),
});

settingsRouter.get('/custom-fields', auth, async (req, res, next) => {
  try {
    const fields = await prisma.customFieldDef.findMany({
      where: { businessId: req.user.business_id, ...(req.query.entity && { entity: String(req.query.entity) }) },
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ fields });
  } catch (err) { next(err); }
});

settingsRouter.post('/custom-fields', auth, requireRole('owner', 'manager'), validate(CustomFieldSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const field = await prisma.customFieldDef.create({
      data: {
        businessId: req.user.business_id, entity: b.entity, label: b.label,
        fieldType: b.field_type, options: b.field_type === 'select' ? (b.options || []) : null,
        required: !!b.required, sortOrder: b.sort_order ?? 0, isActive: b.is_active !== false,
      },
    });
    res.status(201).json(field);
  } catch (err) { next(err); }
});

settingsRouter.put('/custom-fields/:id', auth, requireRole('owner', 'manager'), validate(CustomFieldSchema.partial()), async (req, res, next) => {
  try {
    if (!CF_UUID.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const f = await prisma.customFieldDef.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!f) return res.status(404).json({ title: 'Not found', status: 404 });
    const b = req.body;
    const updated = await prisma.customFieldDef.update({
      where: { id: f.id },
      data: {
        ...(b.label !== undefined && { label: b.label }),
        ...(b.field_type !== undefined && { fieldType: b.field_type, options: b.field_type === 'select' ? (b.options || f.options || []) : null }),
        ...(b.options !== undefined && b.field_type === undefined && { options: b.options }),
        ...(b.required !== undefined && { required: b.required }),
        ...(b.sort_order !== undefined && { sortOrder: b.sort_order }),
        ...(b.is_active !== undefined && { isActive: b.is_active }),
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

settingsRouter.delete('/custom-fields/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    if (!CF_UUID.test(req.params.id)) return res.status(404).json({ title: 'Not found', status: 404 });
    const f = await prisma.customFieldDef.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!f) return res.status(404).json({ title: 'Not found', status: 404 });
    // Values on entity rows are keyed by this id; they simply stop rendering.
    await prisma.customFieldDef.delete({ where: { id: f.id } });
    res.json({ message: 'Field deleted.' });
  } catch (err) { next(err); }
});

module.exports = { settingsRouter, notificationsRouter };
