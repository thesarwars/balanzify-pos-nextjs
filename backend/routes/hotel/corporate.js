// Corporate accounts, payments and month-end invoices.

const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const accounting = require('../../lib/accounting');
const {
  uuid, money, isoDate,
  RoomTypeSchema, RoomSchema, RatePlanSchema, ReservationSchema, FolioChargeSchema, FolioPaymentSchema,
  nightsBetween, reservationNumber, folioNumber, asFraction, bookPenalty, resolveBestRate,
} = require('./_shared');

const router = express.Router();

// ── CORPORATE ACCOUNTS ────────────────────────────────────────────

router.get('/corporate', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const accounts = await prisma.corporateAccount.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      orderBy: { companyName: 'asc' },
    });
    res.json({ accounts });
  } catch (err) { next(err); }
});

router.post('/corporate', auth, requireRole('owner', 'manager'), validate(z.object({
  companyName:     z.string().trim().min(1).max(255),
  contactPerson:   z.string().optional(),
  phone:           z.string().optional(),
  email:           z.string().email().optional().nullable(),
  address:         z.string().optional(),
  creditLimit:     z.coerce.number().nonnegative().default(0),
  paymentTermsDays: z.coerce.number().int().positive().default(30),
  negotiatedRate:  z.coerce.number().nonnegative().optional().nullable(),
  currency:        z.string().length(3).default('USD'),
  notes:           z.string().optional(),
})), async (req, res, next) => {
  try {
    const account = await prisma.corporateAccount.create({
      data: { businessId: req.user.business_id, ...req.body },
    });
    res.status(201).json(account);
  } catch (err) { next(err); }
});

// Record a payment from a corporate account against its city-ledger balance.
// Reduces the outstanding balance and brings cash in (Dr cash / Cr AR).
router.post('/corporate/:id/payment', auth, requireRole('owner', 'manager'), validate(z.object({
  amount:    money.refine(v => v > 0),
  provider:  z.string().min(1).max(50).default('bank'),
  reference: z.string().max(255).optional().nullable(),
})), async (req, res, next) => {
  try {
    const account = await prisma.corporateAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!account) return res.status(404).json({ error: 'Corporate account not found.' });

    const outstanding = parseFloat(account.outstandingBalance || 0);
    const amount = Math.min(parseFloat(req.body.amount), outstanding);
    if (outstanding <= 0) return res.status(400).json({ error: 'This account has no outstanding balance.' });

    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.corporateAccount.update({
        where: { id: account.id },
        data:  { outstandingBalance: { decrement: amount } },
      });
      await accounting.postJournal(tx, {
        businessId: req.user.business_id, description: `Corporate payment — ${account.companyName}`,
        sourceType: 'corporate_payment', sourceId: account.id, createdById: req.user.id,
        lines: [
          { code: accounting.tenderAccountCode(req.body.provider), debit: amount, credit: 0, description: 'Payment received' },
          { code: '1100', debit: 0, credit: amount, description: 'Guest folio (AR)' },
        ],
      });
      return a;
    });

    res.json({ message: 'Payment recorded.', paid: amount, outstanding_balance: parseFloat(updated.outstandingBalance) });
  } catch (err) { next(err); }
});

// ── CORPORATE ACCOUNT INVOICE ─────────────────────────────────────
// Generate a month-end invoice for a corporate account

router.get('/corporate/:id/invoice', auth, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const account = await prisma.corporateAccount.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!account) return res.status(404).json({ error: 'Corporate account not found.' });

    // month is 1-based in the API; default to the current calendar month.
    const y = year  ? parseInt(year)  : new Date().getFullYear();
    const m = month ? parseInt(month) : new Date().getMonth() + 1;
    const fromDate = new Date(y, m - 1, 1);
    const toDate   = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0, 23, 59, 59);

    // Get all reservations for this corporate account in the period
    const reservations = await prisma.reservation.findMany({
      where: {
        businessId:        req.user.business_id,
        corporateAccountId: req.params.id,
        checkInDate: { gte: fromDate, lte: toDate },
        status: { in: ['checked_out','checked_in'] },
      },
      include: {
        guest: { select: { name: true } },
        room:  { select: { number: true, roomType: { select: { name: true } } } },
        folio: { include: { charges: { where: { isVoid: false } }, payments: true } },
      },
    });

    const totalCharges  = reservations.reduce((s, r) => s + (r.folio?.charges || []).reduce((fs, c) => fs + parseFloat(c.totalAmount), 0), 0);
    const totalPayments = reservations.reduce((s, r) => s + (r.folio?.payments || []).reduce((fp, p) => fp + parseFloat(p.amount), 0), 0);

    res.json({
      account,
      period:         { from: fromDate.toISOString().split('T')[0], to: toDate.toISOString().split('T')[0] },
      reservations,
      total_charges:  parseFloat(totalCharges.toFixed(2)),
      total_payments: parseFloat(totalPayments.toFixed(2)),
      balance_due:    parseFloat((totalCharges - totalPayments).toFixed(2)),
      currency:       account.currency,
    });
  } catch (err) { next(err); }
});

module.exports = router;
