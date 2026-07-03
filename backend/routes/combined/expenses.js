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

// ── EXPENSES ──────────────────────────────────────────────────────────────────
const expensesRouter = express.Router();

expensesRouter.get('/', auth, async (req, res, next) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { businessId: req.user.business_id },
      include: { category: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
    res.json({ expenses });
  } catch (err) { next(err); }
});

expensesRouter.post('/', auth, validate(ExpenseSchema), async (req, res, next) => {
  try {
    const { category_id, location_id, amount, date, payment_status, expense_for, note, is_refund, receipt_url } = req.body;
    const expense = await prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          businessId: req.user.business_id,
          categoryId: category_id || null,
          locationId: location_id || null,
          expenseNumber: `EXP-${Date.now()}`,
          amount,
          paymentStatus: payment_status || 'paid',
          expenseFor: expense_for || null,
          note: note || null,
          receiptUrl: receipt_url || null,
          isRefund: is_refund || false,
          expenseDate: date ? new Date(date) : new Date(),
          createdById: req.user.id,
        },
        include: { category: { select: { name: true } }, location: { select: { name: true } } },
      });
      // GL: record the expense against cash (or payables if unpaid).
      await accounting.postExpense(tx, {
        businessId: req.user.business_id, amount,
        paid: (payment_status || 'paid') === 'paid', isRefund: is_refund || false,
        description: e.category?.name ? `Expense — ${e.category.name}` : 'Operating expense',
        sourceId: e.id, createdById: req.user.id,
      });
      return e;
    });
    res.status(201).json(expense);
  } catch (err) { next(err); }
});

expensesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const exp = await prisma.expense.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!exp) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ message: 'Expense deleted.' });
  } catch (err) { next(err); }
});

const expenseCategoriesRouter = express.Router();

expenseCategoriesRouter.get('/', auth, async (req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { businessId: req.user.business_id }, orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
});

expenseCategoriesRouter.post('/', auth, requireRole('owner', 'manager'), validate(ExpenseCategorySchema), async (req, res, next) => {
  try {
    const category = await prisma.expenseCategory.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name },
      update: {},
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
});

// ── PAYMENT ACCOUNTS ──────────────────────────────────────────────────────────
const paymentAccountsRouter = express.Router();

paymentAccountsRouter.get('/', auth, async (req, res, next) => {
  try {
    const accounts = await prisma.paymentAccount.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ accounts });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PaymentAccountSchema), async (req, res, next) => {
  try {
    const { name, type, account_number, balance } = req.body;
    const account = await prisma.paymentAccount.create({
      data: { businessId: req.user.business_id, name, type: type || 'Cash', accountNumber: account_number || null, balance: balance || 0 },
    });
    res.status(201).json(account);
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/transfer', auth, requireRole('owner', 'manager'), validate(AccountTransferSchema), async (req, res, next) => {
  try {
    const { from_id, to_id, amount } = req.body;
    const [from, to] = await Promise.all([
      prisma.paymentAccount.findFirst({ where: { id: from_id, businessId: req.user.business_id } }),
      prisma.paymentAccount.findFirst({ where: { id: to_id, businessId: req.user.business_id } }),
    ]);
    if (!from || !to) return res.status(404).json({ title: 'Account not found', status: 404 });
    if (parseFloat(from.balance) < amount) return res.status(400).json({ title: 'Insufficient balance', status: 400 });
    await prisma.$transaction([
      prisma.paymentAccount.update({ where: { id: from_id }, data: { balance: { decrement: amount } } }),
      prisma.paymentAccount.update({ where: { id: to_id }, data: { balance: { increment: amount } } }),
    ]);
    res.json({ message: 'Transfer complete.' });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/:id/deposit', auth, requireRole('owner', 'manager'), validate(AccountDepositSchema), async (req, res, next) => {
  try {
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { balance: { increment: req.body.amount } } });
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Account removed.' });
  } catch (err) { next(err); }
});


module.exports = { expensesRouter, expenseCategoriesRouter, paymentAccountsRouter };
