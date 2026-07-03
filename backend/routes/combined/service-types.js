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

// ── SERVICE TYPES (restaurant) ──────────────────────────────────────────────────
const serviceTypesRouter = express.Router();
const DEFAULT_SERVICE_TYPES = [
  { name: 'Dine-in',           packingCharge: 0,   packingChargeType: 'fixed' },
  { name: 'Parcel / Takeaway', packingCharge: 0.5, packingChargeType: 'fixed' },
  { name: 'Delivery',          packingCharge: 5,   packingChargeType: 'percentage' },
];
async function ensureServiceTypes(businessId) {
  if ((await prisma.serviceType.count({ where: { businessId } })) === 0) {
    await prisma.serviceType.createMany({ data: DEFAULT_SERVICE_TYPES.map(t => ({ businessId, ...t })) });
  }
}
const serializeServiceType = (t) => ({ id: t.id, name: t.name, packing_charge: parseFloat(t.packingCharge), packing_charge_type: t.packingChargeType, enabled: t.enabled });

serviceTypesRouter.get('/', auth, async (req, res, next) => {
  try {
    await ensureServiceTypes(req.user.business_id);
    const all = ['1', 'true'].includes(String(req.query.all));
    const types = await prisma.serviceType.findMany({
      where: { businessId: req.user.business_id, ...(all ? {} : { enabled: true }) },
      orderBy: { createdAt: 'asc' },
    });
    res.json(types.map(serializeServiceType));
  } catch (err) { next(err); }
});
serviceTypesRouter.post('/', auth, requireRole('owner', 'manager'), validate(ServiceTypeSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const t = await prisma.serviceType.create({ data: { businessId: req.user.business_id, name: b.name, packingCharge: b.packing_charge || 0, packingChargeType: b.packing_charge_type || 'fixed', enabled: b.enabled ?? true } });
    res.status(201).json(serializeServiceType(t));
  } catch (err) { next(err); }
});
serviceTypesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(ServiceTypeSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.serviceType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const b = req.body;
    const t = await prisma.serviceType.update({ where: { id: req.params.id }, data: {
      ...(b.name !== undefined && { name: b.name }),
      ...(b.packing_charge !== undefined && { packingCharge: b.packing_charge }),
      ...(b.packing_charge_type !== undefined && { packingChargeType: b.packing_charge_type }),
      ...(b.enabled !== undefined && { enabled: b.enabled }),
    }});
    res.json(serializeServiceType(t));
  } catch (err) { next(err); }
});
serviceTypesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const t = await prisma.serviceType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.serviceType.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});


module.exports = { serviceTypesRouter };
