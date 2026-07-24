// Reservations: booking, check-in, check-out, cancellation/no-show, deposits and early/late checkin.

const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const webhooks = require('../../lib/webhooks');
const accounting = require('../../lib/accounting');
const {
  uuid, money, isoDate,
  RoomTypeSchema, RoomSchema, RatePlanSchema, ReservationSchema, FolioChargeSchema, FolioPaymentSchema,
  nightsBetween, reservationNumber, folioNumber, asFraction, bookPenalty, resolveBestRate,
} = require('./_shared');

const router = express.Router();

// ── RESERVATIONS ──────────────────────────────────────────────────

router.get('/reservations', auth, async (req, res, next) => {
  try {
    const { status, from, to, search } = req.query;
    const today = new Date(); today.setHours(0,0,0,0);

    const reservations = await prisma.reservation.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status && { status }),
        ...(from   && { checkInDate:  { gte: new Date(from) } }),
        ...(to     && { checkOutDate: { lte: new Date(to)   } }),
        ...(search && {
          OR: [
            { reservationNumber: { contains: search, mode: 'insensitive' } },
            { guest: { name:  { contains: search, mode: 'insensitive' } } },
            { guest: { phone: { contains: search } } },
          ],
        }),
      },
      include: {
        room:     { select: { number: true, floor: true, roomType: { select: { name: true } } } },
        guest:    { select: { name: true, phone: true, whatsapp: true } },
        folio:    { select: { id: true, balance: true, status: true, totalCharges: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { checkInDate: 'asc' },
      take: 100,
    });

    // Today's activity summary
    const [arrivalsToday, departuresToday, inHouse] = await Promise.all([
      prisma.reservation.count({ where: { businessId: req.user.business_id, checkInDate: { gte: today, lt: new Date(today.getTime() + 86400000) }, status: 'confirmed' } }),
      prisma.reservation.count({ where: { businessId: req.user.business_id, checkOutDate: { gte: today, lt: new Date(today.getTime() + 86400000) }, status: { in: ['checked_in', 'checked_out'] } } }),
      prisma.reservation.count({ where: { businessId: req.user.business_id, status: 'checked_in' } }),
    ]);

    res.json({ reservations, summary: { arrivals_today: arrivalsToday, departures_today: departuresToday, in_house: inHouse } });
  } catch (err) { next(err); }
});

router.post('/reservations', auth, validate(ReservationSchema), async (req, res, next) => {
  try {
    const { roomId, guestId, guestName, guestPhone, guestWhatsapp,
            checkInDate, checkOutDate, adults, children,
            ratePlanId, ratePerNight, currency, bookingSource,
            corporateAccountId, specialRequests, depositPaid,
            guestIdType, guestIdNumber, notes } = req.body;

    const nights = nightsBetween(checkInDate, checkOutDate);
    if (nights < 1) return res.status(400).json({ error: 'Check-out must be after check-in.' });

    // The room must belong to this business.
    const roomRow = await prisma.room.findFirst({ where: { id: roomId, businessId: req.user.business_id }, select: { id: true } });
    if (!roomRow) return res.status(404).json({ error: 'Room not found.' });

    // Resolve or create guest record (outside the booking tx is fine)
    let resolvedGuestId = guestId;
    if (!resolvedGuestId && guestName) {
      const guest = await prisma.customer.create({
        data: {
          businessId: req.user.business_id,
          name:      guestName,
          phone:     guestPhone     || null,
          whatsapp:  guestWhatsapp  || null,
        },
      });
      resolvedGuestId = guest.id;
    }
    if (!resolvedGuestId) {
      return res.status(400).json({ error: 'Provide either guestId or guestName.' });
    }

    // Resolve rate: explicit rate wins, then a named plan (length-of-stay
    // enforced), then a corporate negotiated rate, then the Best Available Rate
    // across the stay (seasonal/long-stay), then the room-type base rate.
    let resolvedRate = ratePerNight, appliedPlanId = ratePlanId || null;
    if (ratePlanId) {
      const plan = await prisma.ratePlan.findFirst({ where: { id: ratePlanId, businessId: req.user.business_id } });
      if (!plan) return res.status(404).json({ error: 'Rate plan not found.' });
      if (nights < plan.minNights || (plan.maxNights && nights > plan.maxNights)) {
        return res.status(400).json({ error: `Rate plan "${plan.name}" requires ${plan.minNights}${plan.maxNights ? `–${plan.maxNights}` : '+'} nights; this stay is ${nights}.`, code: 'LOS_VIOLATION' });
      }
      if (!resolvedRate) resolvedRate = parseFloat(plan.ratePerNight);
    }
    if (!resolvedRate && corporateAccountId) {
      const corp = await prisma.corporateAccount.findFirst({ where: { id: corporateAccountId, businessId: req.user.business_id }, select: { negotiatedRate: true } });
      if (corp?.negotiatedRate != null) resolvedRate = parseFloat(corp.negotiatedRate);
    }
    if (!resolvedRate) {
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { roomType: { select: { id: true, baseRate: true } } } });
      const best = room ? await resolveBestRate(req.user.business_id, room.roomType.id, checkInDate, checkOutDate) : null;
      if (best && best.rate > 0) { resolvedRate = best.rate; if (best.plan) appliedPlanId = best.plan.id; }
      else resolvedRate = room ? parseFloat(room.roomType.baseRate) : 0;
    }

    const totalRoomCharge = resolvedRate * nights;

    // Overbooking control: by default a date overlap is rejected; a property can
    // opt in to overbooking (allowOverbooking) to accept the risk deliberately.
    const obSettings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id }, select: { allowOverbooking: true } });
    const allowOverbooking = obSettings?.allowOverbooking === true;

    let conflictErr = null;
    const reservation = await prisma.$transaction(async (tx) => {
      // Serialize bookings for this room: lock the room row, THEN check for an
      // overlap inside the same transaction. Without the lock two concurrent
      // requests both pass the availability check and double-book.
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId}::uuid FOR UPDATE`;
      const conflict = await tx.reservation.findFirst({
        where: {
          roomId,
          status: { in: ['confirmed', 'checked_in'] },
          AND: [
            { checkInDate:  { lt: new Date(checkOutDate) } },
            { checkOutDate: { gt: new Date(checkInDate)  } },
          ],
        },
      });
      if (conflict && !allowOverbooking) {
        conflictErr = `Room is already reserved from ${conflict.checkInDate.toISOString().split('T')[0]} to ${conflict.checkOutDate.toISOString().split('T')[0]}.`;
        return null;
      }

      const res = await tx.reservation.create({
        data: {
          businessId:        req.user.business_id,
          reservationNumber: reservationNumber(),
          roomId,
          guestId:           resolvedGuestId,
          checkInDate:       new Date(checkInDate),
          checkOutDate:      new Date(checkOutDate),
          nights,
          adults:            adults || 1,
          children:          children || 0,
          ratePlanId:        appliedPlanId,
          ratePerNight:      resolvedRate,
          currency:          currency || 'USD',
          totalRoomCharge,
          depositPaid:       depositPaid || 0,
          bookingSource:     bookingSource || 'walk_in',
          corporateAccountId: corporateAccountId || null,
          specialRequests:   specialRequests || null,
          guestIdType:       guestIdType || null,
          guestIdNumber:     guestIdNumber || null,
          notes:             notes || null,
          createdById:       req.user.id,
        },
        include: {
          room:  { select: { number: true, roomType: { select: { name: true } } } },
          guest: { select: { name: true, phone: true } },
        },
      });

      // Mark room as reserved
      await tx.room.update({ where: { id: roomId }, data: { status: 'reserved' } });

      return res;
    });

    if (conflictErr) {
      return res.status(409).json({ error: conflictErr, code: 'ROOM_NOT_AVAILABLE' });
    }

    webhooks.emit(req.user.business_id, 'reservation.created', {
      type:           'reservation',
      reservation_id: reservation.id,
      guest:          reservation.guest.name,
      room:           reservation.room.number,
      check_in:       checkInDate,
      check_out:      checkOutDate,
      total:          totalRoomCharge,
    }).catch(() => {});

    res.status(201).json(reservation);
  } catch (err) { next(err); }
});

router.get('/reservations/:id', auth, async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        room:  { include: { roomType: true } },
        guest: true,
        folio: { include: { charges: { where: { isVoid: false }, orderBy: { createdAt: 'asc' } }, payments: { orderBy: { createdAt: 'asc' } } } },
        createdBy:    { select: { name: true } },
        checkedInBy:  { select: { name: true } },
        checkedOutBy: { select: { name: true } },
      },
    });
    if (!reservation) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(reservation);
  } catch (err) { next(err); }
});

// ── CHECK IN ──────────────────────────────────────────────────────

router.post('/reservations/:id/checkin', auth, validate(z.object({
  actual_check_in: z.string().optional().nullable(),
  notes:           z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: 'confirmed' },
      include: { room: true, guest: { select: { name: true } } },
    });
    if (!reservation) return res.status(404).json({ error: 'Confirmed reservation not found.' });

    // Honour the property's auto-post setting (defaults to on).
    const hotelSettings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id } });
    const autoPostRoom = hotelSettings ? hotelSettings.autoPostRoomCharges !== false : true;

    await prisma.$transaction(async (tx) => {
      // Update reservation status
      await tx.reservation.update({
        where: { id: req.params.id },
        data: { status: 'checked_in', actualCheckIn: new Date(), checkedInById: req.user.id },
      });

      // Mark room occupied
      await tx.room.update({ where: { id: reservation.roomId }, data: { status: 'occupied' } });

      // Create folio
      const folio = await tx.folio.create({
        data: {
          businessId:    req.user.business_id,
          folioNumber:   folioNumber(),
          reservationId: req.params.id,
          guestId:       reservation.guestId,
          currency:      reservation.currency,
        },
      });

      // Post the room-night charge to the folio. Without this the folio stays
      // empty, room revenue reports as 0, and checkout never enforces a balance.
      const rate   = parseFloat(reservation.ratePerNight || 0);
      const nights = reservation.nights || 1;
      const roomTotal = parseFloat((rate * nights).toFixed(2));
      if (autoPostRoom && roomTotal > 0) {
        await tx.folioCharge.create({
          data: {
            folioId:     folio.id,
            businessId:  req.user.business_id,
            type:        'room_night',
            description: `Room charge — ${nights} night(s) @ ${reservation.currency} ${rate.toFixed(2)}`,
            quantity:    nights,
            unitAmount:  rate,
            totalAmount: roomTotal,
            currency:    reservation.currency,
            chargeDate:  reservation.checkInDate,
          },
        });
        await tx.folio.update({
          where: { id: folio.id },
          data:  { totalCharges: { increment: roomTotal }, balance: { increment: roomTotal } },
        });
        await accounting.postFolioCharge(tx, { businessId: req.user.business_id, type: 'room_night', amount: roomTotal, description: 'Room charge', sourceId: folio.id, createdById: req.user.id });
      }

      // Carry any pre-paid deposit onto the folio as a payment, so the guest
      // isn't billed again for money already collected at reservation time.
      const deposit = parseFloat(reservation.depositPaid || 0);
      if (deposit > 0) {
        await tx.folioPayment.create({
          data: {
            folioId:      folio.id,
            businessId:   req.user.business_id,
            provider:     'deposit',
            amount:       deposit,
            currency:     reservation.currency,
            notes:        'Reservation deposit carried to folio',
            receivedById: req.user.id,
          },
        });
        await tx.folio.update({
          where: { id: folio.id },
          data:  { totalPayments: { increment: deposit }, balance: { decrement: deposit } },
        });
        await accounting.postFolioPayment(tx, { businessId: req.user.business_id, method: 'deposit', amount: deposit, sourceId: folio.id, createdById: req.user.id });
      }
    });

    // Send WhatsApp welcome if guest has whatsapp (non-blocking)
    const guest = await prisma.customer.findUnique({ where: { id: reservation.guestId } });
    if (guest?.whatsapp) {
      const msg = `Welcome to ${req.user.business_name}, ${guest.name}! 🏨\n\nRoom: ${reservation.room.number}\nCheck-out: ${reservation.checkOutDate.toISOString().split('T')[0]}\n\nIf you need anything, reply to this message.`;
      await prisma.whatsappLog.create({
        data: {
          businessId:    req.user.business_id,
          recipientPhone: guest.whatsapp,
          messageType:   'check_in',
          content:       msg,
          referenceType: 'reservation',
          referenceId:   req.params.id,
        },
      });
    }

    res.json({ message: 'Guest checked in.', reservation_id: req.params.id });
  } catch (err) { next(err); }
});

// ── CHECK OUT ─────────────────────────────────────────────────────

router.post('/reservations/:id/checkout', auth, validate(z.object({
  actual_check_out:   z.string().optional().nullable(),
  settlement_method:  z.string().max(50).optional().default('cash'),
  notes:              z.string().max(500).optional().nullable(),
  force_checkout:     z.boolean().optional().default(false),
  bill_to_corporate:  z.boolean().optional().default(false), // transfer the balance to the corporate city ledger
})), async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: 'checked_in' },
      include: { folio: { include: { charges: { where: { isVoid: false } }, payments: true } }, room: true },
    });
    if (!reservation) return res.status(404).json({ error: 'Checked-in reservation not found.' });

    const folio = reservation.folio;
    if (!folio) return res.status(400).json({ error: 'No folio found. Contact support.' });

    // Apply service charge + tax from the property settings, once, before
    // settling. Service charge applies to the running charges; tax applies to
    // charges + service charge. Both are skipped if already posted (idempotent).
    const settings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id } });
    const scPct   = asFraction(settings?.serviceChargePct);
    const taxPct  = asFraction(settings?.taxRate);
    const levyPct = asFraction(settings?.tourismLevyPct);
    const alreadyPosted = (folio.charges || []).some(c => c.type === 'service_charge' || c.type === 'tax');
    if (!alreadyPosted && (scPct > 0 || taxPct > 0 || levyPct > 0)) {
      const base = (folio.charges || []).reduce((s, c) => s + parseFloat(c.totalAmount), 0);
      const serviceCharge = parseFloat((base * scPct).toFixed(2));
      const tax  = parseFloat(((base + serviceCharge) * taxPct).toFixed(2));
      const levy = parseFloat((base * levyPct).toFixed(2)); // tourism levy is on room/services, not on tax
      await prisma.$transaction(async (tx) => {
        if (serviceCharge > 0) {
          await tx.folioCharge.create({ data: {
            folioId: folio.id, businessId: req.user.business_id, type: 'service_charge',
            description: `Service charge (${(scPct * 100).toFixed(1)}%)`, quantity: 1,
            unitAmount: serviceCharge, totalAmount: serviceCharge, currency: folio.currency, chargeDate: new Date(),
          } });
          await accounting.postFolioCharge(tx, { businessId: req.user.business_id, type: 'service_charge', amount: serviceCharge, description: 'Service charge', sourceId: folio.id, createdById: req.user.id });
        }
        if (tax > 0) {
          await tx.folioCharge.create({ data: {
            folioId: folio.id, businessId: req.user.business_id, type: 'tax',
            description: `Tax (${(taxPct * 100).toFixed(1)}%)`, quantity: 1,
            unitAmount: tax, totalAmount: tax, currency: folio.currency, chargeDate: new Date(),
          } });
          await accounting.postFolioCharge(tx, { businessId: req.user.business_id, type: 'tax', amount: tax, description: 'Tax', sourceId: folio.id, createdById: req.user.id });
        }
        if (levy > 0) {
          await tx.folioCharge.create({ data: {
            folioId: folio.id, businessId: req.user.business_id, type: 'tax',
            description: `Tourism levy (${(levyPct * 100).toFixed(1)}%)`, quantity: 1,
            unitAmount: levy, totalAmount: levy, currency: folio.currency, chargeDate: new Date(),
          } });
          await accounting.postFolioCharge(tx, { businessId: req.user.business_id, type: 'tax', amount: levy, description: 'Tourism levy', sourceId: folio.id, createdById: req.user.id });
        }
        const added = serviceCharge + tax + levy;
        if (added > 0) {
          await tx.folio.update({ where: { id: folio.id }, data: { totalCharges: { increment: added }, balance: { increment: added } } });
        }
      });
      // Reflect the newly-posted charges in the balance we evaluate below.
      folio.balance = parseFloat(folio.balance) + serviceCharge + tax + levy;
    }

    let balance = parseFloat(folio.balance);

    // City ledger: bill the balance to the guest's corporate account instead of
    // collecting now. The receivable stays on the GL (1100); the corporate
    // sub-ledger (outstandingBalance) records what the company owes, cleared
    // later via POST /corporate/:id/payment.
    let cityLedger = null;
    if (req.body.bill_to_corporate && balance > 0) {
      if (!reservation.corporateAccountId) {
        return res.status(400).json({ error: 'This reservation has no corporate account to bill.' });
      }
      const account = await prisma.corporateAccount.findFirst({ where: { id: reservation.corporateAccountId, businessId: req.user.business_id } });
      if (!account) return res.status(400).json({ error: 'Corporate account not found.' });
      const transferred = balance;
      await prisma.$transaction(async (tx) => {
        await tx.folioPayment.create({ data: {
          folioId: folio.id, businessId: req.user.business_id, provider: 'city_ledger', amount: transferred,
          currency: folio.currency, notes: `Billed to ${account.companyName}`, receivedById: req.user.id,
        } });
        await tx.folio.update({ where: { id: folio.id }, data: { totalPayments: { increment: transferred }, balance: 0 } });
        await tx.corporateAccount.update({ where: { id: account.id }, data: { outstandingBalance: { increment: transferred } } });
      });
      cityLedger = { account_id: account.id, company: account.companyName, transferred };
      balance = 0;
    }

    // Split folios for this reservation must also be settled before checkout.
    const splitFolios = await prisma.folio.findMany({
      where: { businessId: req.user.business_id, splitFromReservationId: req.params.id, balance: { gt: 0 } },
      select: { id: true, folioNumber: true, balance: true },
    });
    if (splitFolios.length && !req.body.force_checkout) {
      return res.status(400).json({
        error: `${splitFolios.length} split folio(s) still carry a balance; settle them before checkout.`,
        split_folios: splitFolios.map(f => ({ id: f.id, folio_number: f.folioNumber, balance: parseFloat(f.balance) })),
        code: 'SPLIT_FOLIO_OUTSTANDING',
      });
    }

    // Check balance — can't check out with unpaid balance unless explicitly overriding
    if (balance > 0 && !req.body.force_checkout) {
      return res.status(400).json({
        error:   `Outstanding balance of ${folio.currency} ${balance.toFixed(2)} must be settled before checkout.`,
        balance,
        folio_id: folio.id,
        code:    'OUTSTANDING_BALANCE',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: req.params.id },
        data: { status: 'checked_out', actualCheckOut: new Date(), checkedOutById: req.user.id },
      });
      await tx.room.update({
        where: { id: reservation.roomId },
        data: { status: 'checkout' }, // Triggers housekeeping
      });
      await tx.folio.update({
        where: { id: folio.id },
        data: { status: balance <= 0 ? 'settled' : 'pending', settledById: balance <= 0 ? req.user.id : null, settledAt: balance <= 0 ? new Date() : null },
      });
      // Auto-create housekeeping task
      await tx.housekeepingLog.create({
        data: { businessId: req.user.business_id, roomId: reservation.roomId, type: 'checkout_clean', status: 'pending' },
      });
    });

    res.json({ message: 'Guest checked out.', balance_remaining: Math.max(0, balance), folio_id: folio.id, ...(cityLedger && { city_ledger: cityLedger }) });
  } catch (err) { next(err); }
});

// Cancel a reservation. A cancellation inside the property's deadline window
// incurs the cancellation fee (a fraction of the stay), booked to the GL and
// offset against any deposit; the remaining deposit is flagged for refund.
router.delete('/reservations/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!reservation) return res.status(404).json({ title: 'Not found', status: 404 });
    if (reservation.status === 'checked_in') {
      return res.status(400).json({ error: 'Cannot cancel a checked-in reservation. Check out first.' });
    }
    if (['cancelled', 'no_show', 'checked_out'].includes(reservation.status)) {
      return res.status(400).json({ error: `Reservation is already ${reservation.status}.` });
    }

    const settings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id } });
    const deadlineH = settings?.cancellationDeadlineHours ?? 24;
    const feePct    = asFraction(settings?.cancellationFeePct);
    const hoursToCheckIn = (new Date(reservation.checkInDate).getTime() - Date.now()) / 3600000;
    const lateCancel = hoursToCheckIn < deadlineH;
    const penalty = lateCancel && feePct > 0 ? parseFloat((parseFloat(reservation.totalRoomCharge || 0) * feePct).toFixed(2)) : 0;

    const result = await prisma.$transaction(async (tx) => {
      const money = await bookPenalty(tx, { businessId: req.user.business_id, reservation, penalty, label: 'Cancellation fee', userId: req.user.id });
      await tx.reservation.update({ where: { id: req.params.id }, data: { status: 'cancelled', notes: reason ? `Cancelled: ${reason}` : reservation.notes } });
      await tx.room.update({ where: { id: reservation.roomId }, data: { status: 'available' } });
      return money;
    });

    res.json({ message: lateCancel && penalty > 0 ? 'Reservation cancelled — cancellation fee applied.' : 'Reservation cancelled.', late_cancel: lateCancel, ...result });
  } catch (err) { next(err); }
});

// Mark a confirmed reservation as a no-show (the guest never arrived). Applies
// the no-show fee per the property policy, offset against any deposit.
router.post('/reservations/:id/no-show', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (reservation.status !== 'confirmed') return res.status(400).json({ error: `Only a confirmed reservation can be marked no-show (this one is ${reservation.status}).` });

    const settings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id } });
    const feePct  = asFraction(settings?.noShowFeePct);
    const penalty = feePct > 0 ? parseFloat((parseFloat(reservation.totalRoomCharge || 0) * feePct).toFixed(2)) : 0;

    const result = await prisma.$transaction(async (tx) => {
      const money = await bookPenalty(tx, { businessId: req.user.business_id, reservation, penalty, label: 'No-show fee', userId: req.user.id });
      await tx.reservation.update({ where: { id: req.params.id }, data: { status: 'no_show' } });
      await tx.room.update({ where: { id: reservation.roomId }, data: { status: 'available' } });
      return money;
    });

    res.json({ message: 'Reservation marked no-show.', ...result });
  } catch (err) { next(err); }
});

// ── DEPOSIT MANAGEMENT ────────────────────────────────────────────
// Record and track deposits paid at time of booking

router.post('/reservations/:id/deposit', auth, validate(z.object({
  amount:        money.refine(v => v > 0),
  provider:      z.string().default('cash'),
  reference:     z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id,
               status: { in: ['confirmed','checked_in'] } },
    });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });

    const totalDeposit = parseFloat(reservation.depositPaid) + parseFloat(req.body.amount);

    await prisma.$transaction(async (tx) => {
      // Update reservation deposit
      await tx.reservation.update({
        where: { id: req.params.id },
        data:  { depositPaid: totalDeposit },
      });

      // If folio exists, record deposit as payment
      const folio = await tx.folio.findFirst({ where: { reservationId: req.params.id } });
      if (folio) {
        await tx.folioPayment.create({
          data: {
            folioId:     folio.id,
            businessId:  req.user.business_id,
            provider:    req.body.provider,
            amount:      req.body.amount,
            currency:    reservation.currency || 'USD',
            reference:   req.body.reference || null,
            notes:       req.body.notes || 'Deposit payment',
            receivedById: req.user.id,
          },
        });
        await tx.folio.update({
          where: { id: folio.id },
          data: { totalPayments: { increment: parseFloat(req.body.amount) }, balance: { decrement: parseFloat(req.body.amount) } },
        });
      }
    });

    res.json({ message: 'Deposit recorded.', total_deposit: totalDeposit });
  } catch (err) { next(err); }
});

// ── EARLY CHECK-IN / LATE CHECK-OUT ───────────────────────────────

router.post('/reservations/:id/early-checkin', auth, validate(z.object({
  charge: money.default(0),
  notes:  z.string().optional(),
})), async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: 'confirmed' },
      include: { room: true, guest: true },
    });
    if (!reservation) return res.status(404).json({ error: 'Confirmed reservation not found.' });

    const settings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id } });
    const fee = req.body.charge > 0 ? req.body.charge : parseFloat(settings?.earlyCheckInFee || 0);

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id: req.params.id }, data: { status: 'checked_in', actualCheckIn: new Date(), checkedInById: req.user.id } });
      await tx.room.update({ where: { id: reservation.roomId }, data: { status: 'occupied' } });
      const folio = await tx.folio.create({
        data: { businessId: req.user.business_id, folioNumber: folioNumber(), reservationId: req.params.id, guestId: reservation.guestId, currency: reservation.currency },
      });
      if (fee > 0) {
        await tx.folioCharge.create({
          data: {
            folioId: folio.id, businessId: req.user.business_id,
            type: 'other', description: 'Early check-in fee',
            quantity: 1, unitAmount: fee, totalAmount: fee,
            chargeDate: new Date(), postedById: req.user.id,
          },
        });
        await tx.folio.update({ where: { id: folio.id }, data: { totalCharges: { increment: fee }, balance: { increment: fee } } });
      }
    });

    res.json({ message: 'Early check-in processed.', early_checkin_fee: fee });
  } catch (err) { next(err); }
});

router.post('/reservations/:id/late-checkout', auth, validate(z.object({
  charge: money.default(0),
  new_checkout_time: z.string().optional(),
})), async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id, status: 'checked_in' },
      include: { folio: true },
    });
    if (!reservation) return res.status(404).json({ error: 'Checked-in reservation not found.' });

    const settings = await prisma.hotelSettings.findUnique({ where: { businessId: req.user.business_id } });
    const fee = req.body.charge > 0 ? req.body.charge : parseFloat(settings?.lateCheckOutFee || 0);

    if (fee > 0 && reservation.folio) {
      await prisma.$transaction(async (tx) => {
        await tx.folioCharge.create({
          data: {
            folioId: reservation.folio.id, businessId: req.user.business_id,
            type: 'other', description: 'Late check-out fee',
            quantity: 1, unitAmount: fee, totalAmount: fee,
            chargeDate: new Date(), postedById: req.user.id,
          },
        });
        await tx.folio.update({ where: { id: reservation.folio.id }, data: { totalCharges: { increment: fee }, balance: { increment: fee } } });
      });
    }

    res.json({ message: 'Late check-out approved.', late_checkout_fee: fee });
  } catch (err) { next(err); }
});

module.exports = router;
