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

// ── USERS ─────────────────────────────────────────────────────────────────────
const usersRouter = express.Router();

usersRouter.get('/', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { businessId: req.user.business_id },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true, commissionPercent: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) { next(err); }
});

usersRouter.post('/', auth, requireRole('owner'), validate(CreateUserSchema), async (req, res, next) => {
  try {
    const { name, email, password, role, pin, commission_percent } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ title: 'Email already in use', status: 409 });
    const hashed = await bcrypt.hash(password, 12);
    const hashedPin = pin ? await bcrypt.hash(String(pin), 10) : null;
    const user = await prisma.user.create({
      data: { businessId: req.user.business_id, name, email, password: hashed, role, pin: hashedPin, commissionPercent: commission_percent ?? 0 },
      select: { id: true, name: true, email: true, role: true, isActive: true, commissionPercent: true },
    });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

usersRouter.put('/:id', auth, requireRole('owner'), validate(UpdateUserSchema), async (req, res, next) => {
  try {
    // Tenant isolation: only operate on users within the caller's business.
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      select: { id: true, role: true },
    });
    if (!target) return res.status(404).json({ title: 'User not found', status: 404 });

    // Guardrail: never let the last active owner be demoted or deactivated,
    // which would lock the business out of its own admin functions.
    const demotingOrDisabling =
      (req.body.role !== undefined && req.body.role !== 'owner') ||
      req.body.is_active === false;
    if (target.role === 'owner' && demotingOrDisabling) {
      const otherOwners = await prisma.user.count({
        where: { businessId: req.user.business_id, role: 'owner', isActive: true, id: { not: target.id } },
      });
      if (otherOwners === 0) {
        return res.status(409).json({ title: 'Cannot remove the last active owner', status: 409 });
      }
    }

    const hashedPin = req.body.pin ? await bcrypt.hash(String(req.body.pin), 10) : null;
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { name: req.body.name, role: req.body.role, isActive: req.body.is_active, ...(req.body.pin !== undefined && { pin: hashedPin }), ...(req.body.commission_percent !== undefined && { commissionPercent: req.body.commission_percent }) },
      select: { id: true, name: true, email: true, role: true, isActive: true, commissionPercent: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});


module.exports = { usersRouter };
