// Folios: split folios, charges and payments.

const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const registry = require('../../lib/payments');
const accounting = require('../../lib/accounting');
const {
  uuid, money, isoDate,
  RoomTypeSchema, RoomSchema, RatePlanSchema, ReservationSchema, FolioChargeSchema, FolioPaymentSchema,
  nightsBetween, reservationNumber, folioNumber, asFraction, bookPenalty, resolveBestRate,
} = require('./_shared');

const router = express.Router();

// ── SPLIT FOLIOS ──────────────────────────────────────────────────
// A stay can carry more than one bill (e.g. the company pays the room, the
// guest pays incidentals). The primary folio is created at check-in; extra
// "split" folios hang off the same reservation and settle independently.

// List every folio for a reservation (primary + splits).
router.get('/reservations/:id/folios', auth, async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true, guestId: true } });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    const folios = await prisma.folio.findMany({
      where: { businessId: req.user.business_id, OR: [{ reservationId: req.params.id }, { splitFromReservationId: req.params.id }] },
      include: { charges: { where: { isVoid: false } }, payments: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ folios: folios.map(f => ({ ...f, is_primary: f.reservationId === req.params.id })) });
  } catch (err) { next(err); }
});

// Open an additional (split) folio for a reservation.
router.post('/reservations/:id/folios', auth, async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { id: true, guestId: true, currency: true } });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    const folio = await prisma.folio.create({
      data: {
        businessId: req.user.business_id, folioNumber: folioNumber(),
        splitFromReservationId: reservation.id, guestId: reservation.guestId, currency: reservation.currency,
        notes: req.body.notes || 'Split folio',
      },
    });
    res.status(201).json(folio);
  } catch (err) { next(err); }
});

// Move a charge from one folio to another (splitting the bill). Pure sub-ledger
// reallocation: both folios post to the same AR, so the GL is unchanged.
router.post('/folios/:id/charges/:cid/move', auth, requireRole('owner', 'manager'), validate(z.object({
  to_folio_id: uuid,
})), async (req, res, next) => {
  try {
    const [from, to, charge] = await Promise.all([
      prisma.folio.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } }),
      prisma.folio.findFirst({ where: { id: req.body.to_folio_id, businessId: req.user.business_id } }),
      prisma.folioCharge.findFirst({ where: { id: req.params.cid, folioId: req.params.id, isVoid: false } }),
    ]);
    if (!from || !to) return res.status(404).json({ error: 'Folio not found.' });
    if (!charge) return res.status(404).json({ error: 'Charge not found on this folio.' });
    if (from.id === to.id) return res.status(400).json({ error: 'Source and destination folios are the same.' });

    const amount = parseFloat(charge.totalAmount);
    await prisma.$transaction(async (tx) => {
      await tx.folioCharge.update({ where: { id: charge.id }, data: { folioId: to.id } });
      await tx.folio.update({ where: { id: from.id }, data: { totalCharges: { decrement: amount }, balance: { decrement: amount } } });
      await tx.folio.update({ where: { id: to.id },   data: { totalCharges: { increment: amount }, balance: { increment: amount } } });
    });
    res.json({ message: 'Charge moved.', charge_id: charge.id, amount, from_folio: from.id, to_folio: to.id });
  } catch (err) { next(err); }
});

// ── FOLIOS ────────────────────────────────────────────────────────

router.get('/folios/:id', auth, async (req, res, next) => {
  try {
    const folio = await prisma.folio.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        reservation: { select: { reservationNumber: true, checkInDate: true, checkOutDate: true, room: { select: { number: true } } } },
        guest:   { select: { name: true, phone: true, whatsapp: true } },
        charges: { where: { isVoid: false }, orderBy: { chargeDate: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!folio) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(folio);
  } catch (err) { next(err); }
});

router.post('/folios/:id/charges', auth, validate(FolioChargeSchema), async (req, res, next) => {
  try {
    const folio = await prisma.folio.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: 'open' },
    });
    if (!folio) return res.status(404).json({ error: 'Open folio not found.' });

    const { type, description, quantity, unitAmount, chargeDate, taxRateId, referenceId, referenceType } = req.body;

    // Calculate tax if rate provided
    let taxAmount = 0;
    if (taxRateId) {
      const rate = await prisma.taxRate.findUnique({ where: { id: taxRateId } });
      if (rate) {
        const base = parseFloat(unitAmount) * parseFloat(quantity);
        taxAmount = rate.isInclusive ? 0 : base * parseFloat(rate.rate);
      }
    }

    const totalAmount = parseFloat(unitAmount) * parseFloat(quantity);

    const charge = await prisma.$transaction(async (tx) => {
      const c = await tx.folioCharge.create({
        data: {
          folioId:       req.params.id,
          businessId:    req.user.business_id,
          type,
          description,
          quantity,
          unitAmount,
          totalAmount,
          taxAmount,
          taxRateId:     taxRateId || null,
          chargeDate:    new Date(chargeDate),
          referenceId:   referenceId || null,
          referenceType: referenceType || null,
          postedById:    req.user.id,
        },
      });
      // Update folio totals
      await tx.folio.update({
        where: { id: req.params.id },
        data: {
          totalCharges: { increment: totalAmount + taxAmount },
          balance:      { increment: totalAmount + taxAmount },
        },
      });
      // GL: charge raises AR against revenue (+ tax liability if any).
      await accounting.postFolioCharge(tx, { businessId: req.user.business_id, type, amount: totalAmount, description, sourceId: req.params.id, createdById: req.user.id });
      if (parseFloat(taxAmount) > 0) {
        await accounting.postFolioCharge(tx, { businessId: req.user.business_id, type: 'tax', amount: parseFloat(taxAmount), description: 'Tax', sourceId: req.params.id, createdById: req.user.id });
      }
      return c;
    });

    res.status(201).json(charge);
  } catch (err) { next(err); }
});

router.delete('/folios/:id/charges/:chargeId', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const charge = await prisma.folioCharge.findFirst({
      where: { id: req.params.chargeId, folioId: req.params.id, businessId: req.user.business_id, isVoid: false },
    });
    if (!charge) return res.status(404).json({ error: 'Charge not found.' });

    await prisma.$transaction([
      prisma.folioCharge.update({
        where: { id: req.params.chargeId },
        data: { isVoid: true, voidReason: req.body.reason || 'Voided by manager' },
      }),
      prisma.folio.update({
        where: { id: req.params.id },
        data: {
          totalCharges: { decrement: parseFloat(charge.totalAmount) + parseFloat(charge.taxAmount) },
          balance:      { decrement: parseFloat(charge.totalAmount) + parseFloat(charge.taxAmount) },
        },
      }),
    ]);
    res.json({ message: 'Charge voided.' });
  } catch (err) { next(err); }
});

router.post('/folios/:id/payments', auth, validate(FolioPaymentSchema), async (req, res, next) => {
  try {
    const folio = await prisma.folio.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: { in: ['open', 'pending'] } },
    });
    if (!folio) return res.status(404).json({ error: 'Active folio not found.' });

    // Validate provider exists in registry
    if (!registry.has(req.body.provider)) {
      return res.status(400).json({ error: `Unknown payment method: ${req.body.provider}` });
    }

    const { provider, amount, currency, reference, notes, phone } = req.body;

    // Execute payment via registry
    const result = await registry.get(provider).charge({
      amount,
      currency:  currency || folio.currency || 'USD',
      phone:     phone    || null,
      reference: reference || `${folio.folioNumber}-${Date.now()}`,
      meta:      { folio_id: folio.id, guest_id: folio.guestId },
    });

    const newBalance = parseFloat(folio.balance) - parseFloat(amount);

    await prisma.$transaction(async (tx) => {
      await tx.folioPayment.create({
        data: {
          folioId:     req.params.id,
          businessId:  req.user.business_id,
          provider,
          amount,
          currency:    currency || folio.currency || 'USD',
          reference:   result.reference || reference || null,
          notes:       notes || null,
          receivedById: req.user.id,
        },
      });
      await tx.folio.update({
        where: { id: req.params.id },
        data: {
          totalPayments: { increment: parseFloat(amount) },
          balance:       { decrement: parseFloat(amount) },
          status:        newBalance <= 0 ? 'settled' : 'open',
          settledAt:     newBalance <= 0 ? new Date() : null,
          settledById:   newBalance <= 0 ? req.user.id : null,
        },
      });
      // GL: folio payment brings in cash and reduces the guest's receivable.
      await accounting.postFolioPayment(tx, { businessId: req.user.business_id, method: provider, amount: parseFloat(amount), sourceId: req.params.id, createdById: req.user.id });
    });

    res.status(201).json({ payment_result: result, new_balance: Math.max(0, newBalance) });
  } catch (err) { next(err); }
});

module.exports = router;
