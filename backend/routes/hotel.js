/**
 * Hotel / Property Management Routes
 *
 * Room Management:
 *   GET    /api/v1/hotel/rooms                    — room grid with live status
 *   POST   /api/v1/hotel/rooms                    — add a room
 *   PUT    /api/v1/hotel/rooms/:id/status         — update room status
 *   GET    /api/v1/hotel/room-types               — list room types
 *   POST   /api/v1/hotel/room-types               — create room type
 *   GET    /api/v1/hotel/rate-plans               — list rate plans
 *   POST   /api/v1/hotel/rate-plans               — create rate plan
 *
 * Reservations:
 *   GET    /api/v1/hotel/reservations             — list with filters
 *   POST   /api/v1/hotel/reservations             — create reservation
 *   GET    /api/v1/hotel/reservations/:id         — get single
 *   PUT    /api/v1/hotel/reservations/:id         — update
 *   POST   /api/v1/hotel/reservations/:id/checkin — check in guest
 *   POST   /api/v1/hotel/reservations/:id/checkout— check out + settle folio
 *   DELETE /api/v1/hotel/reservations/:id         — cancel
 *
 * Folios:
 *   GET    /api/v1/hotel/folios/:id               — get folio with charges
 *   POST   /api/v1/hotel/folios/:id/charges       — post a charge
 *   DELETE /api/v1/hotel/folios/:id/charges/:cid  — void a charge
 *   POST   /api/v1/hotel/folios/:id/payments      — record payment
 *   POST   /api/v1/hotel/folios/:id/settle        — settle folio at checkout
 *
 * Housekeeping:
 *   GET    /api/v1/hotel/housekeeping             — today's task list
 *   PUT    /api/v1/hotel/housekeeping/:id         — update task status
 *
 * Corporate Accounts:
 *   GET    /api/v1/hotel/corporate                — list accounts
 *   POST   /api/v1/hotel/corporate                — create account
 *
 * Dashboard:
 *   GET    /api/v1/hotel/dashboard                — occupancy, revenue, arrivals/departures
 *   GET    /api/v1/hotel/availability             — room availability calendar
 */

const express  = require('express');
const { z }    = require('zod');
const prisma   = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate }          = require('../middleware/validate');
const registry = require('../lib/payments');
const webhooks = require('../lib/webhooks');
const accounting = require('../lib/accounting');
const router   = express.Router();

// ── Validation schemas ────────────────────────────────────────────
const uuid    = z.string().uuid();
const money   = z.coerce.number().nonnegative().multipleOf(0.01);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const RoomTypeSchema = z.object({
  name:             z.string().trim().min(1).max(100),
  description:      z.string().optional().nullable(),
  maxOccupancy:     z.coerce.number().int().positive().default(2),
  bedConfiguration: z.string().max(100).optional().nullable(),
  amenities:        z.array(z.string()).default([]),
  baseRate:         money,
  currency:         z.string().length(3).default('USD'),
  sortOrder:        z.coerce.number().int().default(0),
});

const RoomSchema = z.object({
  roomTypeId: uuid,
  number:     z.string().trim().min(1).max(20),
  floor:      z.coerce.number().int().optional().nullable(),
  notes:      z.string().optional().nullable(),
});

const RatePlanSchema = z.object({
  roomTypeId:        uuid.optional().nullable(),
  name:              z.string().trim().min(1).max(100),
  description:       z.string().optional().nullable(),
  ratePerNight:      money,
  currency:          z.string().length(3).default('USD'),
  minNights:         z.coerce.number().int().positive().default(1),
  maxNights:         z.coerce.number().int().positive().optional().nullable(),
  includesBreakfast: z.boolean().default(false),
  validFrom:         isoDate.optional().nullable(),
  validUntil:        isoDate.optional().nullable(),
});

const ReservationSchema = z.object({
  roomId:            uuid,
  guestId:           uuid.optional(),    // existing customer
  guestName:         z.string().optional(), // new walk-in guest
  guestPhone:        z.string().optional(),
  guestWhatsapp:     z.string().optional(),
  checkInDate:       isoDate,
  checkOutDate:      isoDate,
  adults:            z.coerce.number().int().positive().default(1),
  children:          z.coerce.number().int().nonnegative().default(0),
  ratePlanId:        uuid.optional().nullable(),
  ratePerNight:      money.optional(),
  currency:          z.string().length(3).default('USD'),
  bookingSource:     z.string().default('walk_in'),
  corporateAccountId: uuid.optional().nullable(),
  specialRequests:   z.string().optional().nullable(),
  depositPaid:       money.default(0),
  guestIdType:       z.enum(['passport','national_id','driving_license','other']).optional(),
  guestIdNumber:     z.string().max(100).optional().nullable(),
  notes:             z.string().optional().nullable(),
}).refine(d => new Date(d.checkOutDate) > new Date(d.checkInDate), {
  message: 'Check-out must be after check-in',
});

const FolioChargeSchema = z.object({
  type:        z.enum(['room_night','restaurant','laundry','minibar','transport','telephone','business_center','spa','damage','discount','tax','service_charge','other']),
  description: z.string().trim().min(1).max(255),
  quantity:    z.coerce.number().positive().default(1),
  unitAmount:  money,
  chargeDate:  isoDate,
  taxRateId:   uuid.optional().nullable(),
  referenceId:   uuid.optional().nullable(),
  referenceType: z.string().max(50).optional().nullable(),
});

const FolioPaymentSchema = z.object({
  provider:  z.string().min(1).max(50),
  amount:    money.refine(v => v > 0),
  currency:  z.string().length(3).default('USD'),
  reference: z.string().max(255).optional().nullable(),
  notes:     z.string().optional().nullable(),
  phone:     z.string().max(30).optional().nullable(),
});

// ── Helpers ───────────────────────────────────────────────────────

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function reservationNumber() { return `RES-${Date.now().toString().slice(-8)}`; }
function folioNumber()       { return `FOL-${Date.now().toString().slice(-8)}`; }

// Best Available Rate: pick the lowest active rate plan that applies to this room
// type, is valid across the stay dates, and whose length-of-stay window fits the
// nights — i.e. seasonal & long-stay pricing. Falls back to the room-type base
// rate when no plan qualifies. This is the dynamic-pricing the model supports but
// nothing previously resolved automatically.
async function resolveBestRate(businessId, roomTypeId, checkIn, checkOut) {
  const nights = nightsBetween(checkIn, checkOut);
  const ci = new Date(checkIn);
  const plans = await prisma.ratePlan.findMany({
    where: {
      businessId, isActive: true,
      OR: [{ roomTypeId }, { roomTypeId: null }],
      minNights: { lte: nights },
      AND: [
        { OR: [{ maxNights: null }, { maxNights: { gte: nights } }] },
        { OR: [{ validFrom: null }, { validFrom: { lte: ci } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: ci } }] },
      ],
    },
    orderBy: { ratePerNight: 'asc' },
  });
  // Prefer a plan scoped to this room type over an all-types plan at the same price.
  plans.sort((a, b) => parseFloat(a.ratePerNight) - parseFloat(b.ratePerNight) || (a.roomTypeId === roomTypeId ? -1 : 1));
  const best = plans[0];
  if (best) {
    const rate = parseFloat(best.ratePerNight);
    return { rate, nights, total: +(rate * nights).toFixed(2), currency: best.currency, source: 'rate_plan', plan: { id: best.id, name: best.name, includes_breakfast: best.includesBreakfast } };
  }
  const rt = roomTypeId ? await prisma.roomType.findFirst({ where: { id: roomTypeId, businessId }, select: { baseRate: true, currency: true } }) : null;
  const rate = rt ? parseFloat(rt.baseRate) : 0;
  return { rate, nights, total: +(rate * nights).toFixed(2), currency: rt?.currency || 'USD', source: 'base_rate', plan: null };
}

// ── ROOM TYPES ────────────────────────────────────────────────────

router.get('/room-types', auth, async (req, res, next) => {
  try {
    const types = await prisma.roomType.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { _count: { select: { rooms: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ room_types: types });
  } catch (err) { next(err); }
});

router.post('/room-types', auth, requireRole('owner', 'manager'), validate(RoomTypeSchema), async (req, res, next) => {
  try {
    const type = await prisma.roomType.create({
      data: { businessId: req.user.business_id, ...req.body },
    });
    res.status(201).json(type);
  } catch (err) { next(err); }
});

router.put('/room-types/:id', auth, requireRole('owner', 'manager'), validate(RoomTypeSchema.partial()), async (req, res, next) => {
  try {
    const type = await prisma.roomType.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: req.body,
    });
    if (!type.count) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(await prisma.roomType.findUnique({ where: { id: req.params.id } }));
  } catch (err) { next(err); }
});

// ── RATE PLANS ────────────────────────────────────────────────────

router.get('/rate-plans', auth, async (req, res, next) => {
  try {
    const plans = await prisma.ratePlan.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { roomType: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ rate_plans: plans });
  } catch (err) { next(err); }
});

router.post('/rate-plans', auth, requireRole('owner', 'manager'), validate(RatePlanSchema), async (req, res, next) => {
  try {
    const plan = await prisma.ratePlan.create({
      data: {
        businessId: req.user.business_id,
        roomTypeId: req.body.roomTypeId || null,
        name: req.body.name, description: req.body.description,
        ratePerNight: req.body.ratePerNight, currency: req.body.currency || 'USD',
        minNights: req.body.minNights || 1, maxNights: req.body.maxNights || null,
        includesBreakfast: req.body.includesBreakfast || false,
        validFrom: req.body.validFrom ? new Date(req.body.validFrom) : null,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : null,
      },
    });
    res.status(201).json(plan);
  } catch (err) { next(err); }
});

// ── ROOMS ─────────────────────────────────────────────────────────

router.get('/rooms', auth, async (req, res, next) => {
  try {
    const { status, floor, room_type_id } = req.query;
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const rooms = await prisma.room.findMany({
      where: {
        businessId: req.user.business_id,
        isActive: true,
        ...(status      && { status }),
        ...(floor       && { floor: parseInt(floor) }),
        ...(room_type_id && { roomTypeId: room_type_id }),
      },
      include: {
        roomType: { select: { name: true, baseRate: true, currency: true, maxOccupancy: true } },
        reservations: {
          where: { status: { in: ['confirmed', 'checked_in'] }, checkInDate: { lte: tomorrow }, checkOutDate: { gte: today } },
          include: { guest: { select: { name: true, phone: true } }, folio: { select: { id: true, balance: true, status: true } } },
          take: 1,
        },
        housekeepingLogs: {
          where: { status: { in: ['pending', 'in_progress'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });

    // Compute occupancy stats
    const stats = {
      total:       rooms.length,
      available:   rooms.filter(r => r.status === 'available').length,
      occupied:    rooms.filter(r => r.status === 'occupied').length,
      cleaning:    rooms.filter(r => r.status === 'cleaning').length,
      maintenance: rooms.filter(r => r.status === 'maintenance').length,
      reserved:    rooms.filter(r => r.status === 'reserved').length,
      occupancy_pct: rooms.length > 0
        ? Math.round((rooms.filter(r => r.status === 'occupied').length / rooms.length) * 100)
        : 0,
    };

    res.json({ rooms, stats });
  } catch (err) { next(err); }
});

router.post('/rooms', auth, requireRole('owner', 'manager'), validate(RoomSchema), async (req, res, next) => {
  try {
    const room = await prisma.room.create({
      data: {
        businessId: req.user.business_id,
        roomTypeId: req.body.roomTypeId,
        number:     req.body.number,
        floor:      req.body.floor || null,
        notes:      req.body.notes || null,
      },
      include: { roomType: { select: { name: true } } },
    });
    res.status(201).json(room);
  } catch (err) { next(err); }
});

router.put('/rooms/:id/status', auth, validate(z.object({
  status: z.enum(['available','occupied','reserved','checkout','cleaning','maintenance','blocked']),
  notes:  z.string().optional(),
})), async (req, res, next) => {
  try {
    const updated = await prisma.room.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { status: req.body.status, ...(req.body.notes && { notes: req.body.notes }) },
    });
    if (!updated.count) return res.status(404).json({ title: 'Room not found', status: 404 });

    // Auto-create housekeeping task when room status changes to 'checkout' or 'cleaning'
    if (['checkout', 'cleaning'].includes(req.body.status)) {
      await prisma.housekeepingLog.create({
        data: {
          businessId: req.user.business_id,
          roomId:     req.params.id,
          type:       req.body.status === 'checkout' ? 'checkout_clean' : 'stayover',
          status:     'pending',
        },
      });
    }
    res.json(await prisma.room.findUnique({ where: { id: req.params.id }, include: { roomType: { select: { name: true } } } }));
  } catch (err) { next(err); }
});

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

    // Resolve rate: explicit rate wins, then a named plan, then the Best Available
    // Rate across the stay (seasonal/long-stay), then the room-type base rate.
    let resolvedRate = ratePerNight, appliedPlanId = ratePlanId || null;
    if (!resolvedRate && ratePlanId) {
      const plan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
      resolvedRate = plan ? parseFloat(plan.ratePerNight) : 0;
    }
    if (!resolvedRate) {
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { roomType: { select: { id: true, baseRate: true } } } });
      const best = room ? await resolveBestRate(req.user.business_id, room.roomType.id, checkInDate, checkOutDate) : null;
      if (best && best.rate > 0) { resolvedRate = best.rate; if (best.plan) appliedPlanId = best.plan.id; }
      else resolvedRate = room ? parseFloat(room.roomType.baseRate) : 0;
    }

    const totalRoomCharge = resolvedRate * nights;

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
      if (conflict) {
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
    const asFraction = (v) => { const n = parseFloat(v || 0); return n > 1 ? n / 100 : n; }; // accept 5 or 0.05
    const scPct  = asFraction(settings?.serviceChargePct);
    const taxPct = asFraction(settings?.taxRate);
    const alreadyPosted = (folio.charges || []).some(c => c.type === 'service_charge' || c.type === 'tax');
    if (!alreadyPosted && (scPct > 0 || taxPct > 0)) {
      const base = (folio.charges || []).reduce((s, c) => s + parseFloat(c.totalAmount), 0);
      const serviceCharge = parseFloat((base * scPct).toFixed(2));
      const tax = parseFloat(((base + serviceCharge) * taxPct).toFixed(2));
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
        const added = serviceCharge + tax;
        if (added > 0) {
          await tx.folio.update({ where: { id: folio.id }, data: { totalCharges: { increment: added }, balance: { increment: added } } });
        }
      });
      // Reflect the newly-posted charges in the balance we evaluate below.
      folio.balance = parseFloat(folio.balance) + serviceCharge + tax;
    }

    // Check balance — can't check out with unpaid balance unless explicitly overriding
    const balance = parseFloat(folio.balance);
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

    res.json({ message: 'Guest checked out.', balance_remaining: Math.max(0, balance), folio_id: folio.id });
  } catch (err) { next(err); }
});

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
    await prisma.$transaction([
      prisma.reservation.update({ where: { id: req.params.id }, data: { status: 'cancelled', notes: reason ? `Cancelled: ${reason}` : reservation.notes } }),
      prisma.room.update({ where: { id: reservation.roomId }, data: { status: 'available' } }),
    ]);
    res.json({ message: 'Reservation cancelled.' });
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

// ── HOUSEKEEPING ──────────────────────────────────────────────────

router.get('/housekeeping', auth, async (req, res, next) => {
  try {
    const { status, floor } = req.query;
    const tasks = await prisma.housekeepingLog.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status && { status }),
        ...(floor  && { room: { floor: parseInt(floor) } }),
      },
      include: {
        room:       { select: { number: true, floor: true, roomType: { select: { name: true } } } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ tasks });
  } catch (err) { next(err); }
});

router.put('/housekeeping/:id', auth, validate(z.object({
  status:       z.enum(['pending','in_progress','done','inspected']),
  assignedToId: z.string().uuid().optional().nullable(),
  notes:        z.string().optional(),
})), async (req, res, next) => {
  try {
    const { status, assignedToId, notes } = req.body;
    const data = {
      status,
      ...(assignedToId !== undefined && { assignedToId }),
      ...(notes && { notes }),
      ...(status === 'in_progress' && { startedAt: new Date() }),
      ...(status === 'done'        && { completedAt: new Date() }),
    };

    const task = await prisma.housekeepingLog.update({ where: { id: req.params.id }, data });

    // When housekeeping is done, mark room available
    if (status === 'done' || status === 'inspected') {
      await prisma.room.update({ where: { id: task.roomId }, data: { status: 'available', lastCleaned: new Date() } });
    }
    res.json(task);
  } catch (err) { next(err); }
});

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

// ── DASHBOARD ─────────────────────────────────────────────────────

router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow  = new Date(today.getTime() + 86400000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      roomStats, arrivalsToday, departuresToday, inHouse,
      revenueToday, revenueMonth, pendingHousekeeping,
      unpaidFolios, recentReservations,
    ] = await Promise.all([
      // Room status breakdown
      prisma.room.groupBy({
        by: ['status'],
        where: { businessId: bizId, isActive: true },
        _count: { id: true },
      }),
      // Arrivals today
      prisma.reservation.count({ where: { businessId: bizId, checkInDate: { gte: today, lt: tomorrow }, status: 'confirmed' } }),
      // Departures today (whether or not they've physically left yet)
      prisma.reservation.count({ where: { businessId: bizId, checkOutDate: { gte: today, lt: tomorrow }, status: { in: ['checked_in', 'checked_out'] } } }),
      // Currently in-house
      prisma.reservation.count({ where: { businessId: bizId, status: 'checked_in' } }),
      // Room revenue today (folio charges for room_night)
      prisma.folioCharge.aggregate({
        where: { businessId: bizId, type: 'room_night', isVoid: false, chargeDate: { gte: today, lt: tomorrow } },
        _sum: { totalAmount: true },
      }),
      // Room revenue this month
      prisma.folioCharge.aggregate({
        where: { businessId: bizId, type: 'room_night', isVoid: false, chargeDate: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      // Pending housekeeping tasks
      prisma.housekeepingLog.count({ where: { businessId: bizId, status: { in: ['pending', 'in_progress'] } } }),
      // Folios with outstanding balance
      prisma.folio.count({ where: { businessId: bizId, status: { in: ['open', 'pending'] }, balance: { gt: 0 } } }),
      // Recent reservations
      prisma.reservation.findMany({
        where: { businessId: bizId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { guest: { select: { name: true } }, room: { select: { number: true } } },
      }),
    ]);

    const totalRooms     = roomStats.reduce((s, r) => s + r._count.id, 0);
    const occupiedRooms  = roomStats.find(r => r.status === 'occupied')?._count.id || 0;
    const availableRooms = roomStats.find(r => r.status === 'available')?._count.id || 0;

    res.json({
      occupancy_pct:        totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      total_rooms:          totalRooms,
      occupied_rooms:       occupiedRooms,
      available_rooms:      availableRooms,
      rooms_by_status:      Object.fromEntries(roomStats.map(r => [r.status, r._count.id])),
      arrivals_today:       arrivalsToday,
      departures_today:     departuresToday,
      in_house:             inHouse,
      room_revenue_today:   parseFloat(revenueToday._sum.totalAmount  || 0),
      room_revenue_month:   parseFloat(revenueMonth._sum.totalAmount   || 0),
      pending_housekeeping: pendingHousekeeping,
      unpaid_folios:        unpaidFolios,
      recent_reservations:  recentReservations,
    });
  } catch (err) { next(err); }
});

// ── AVAILABILITY CALENDAR ─────────────────────────────────────────

// Quote the best available rate for a room type over a stay (seasonal/long-stay
// pricing) — for the booking screen, before a room is even picked.
router.get('/quote', auth, async (req, res, next) => {
  try {
    const { room_type_id, check_in, check_out } = req.query;
    if (!room_type_id || !check_in || !check_out) return res.status(400).json({ error: 'room_type_id, check_in and check_out required.' });
    if (nightsBetween(check_in, check_out) < 1) return res.status(400).json({ error: 'check_out must be after check_in.' });
    const quote = await resolveBestRate(req.user.business_id, room_type_id, check_in, check_out);
    res.json({ room_type_id, check_in, check_out, ...quote });
  } catch (err) { next(err); }
});

router.get('/availability', auth, async (req, res, next) => {
  try {
    const { from, to, room_type_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD).' });

    const rooms = await prisma.room.findMany({
      where: {
        businessId: req.user.business_id,
        isActive: true,
        ...(room_type_id && { roomTypeId: room_type_id }),
      },
      include: {
        roomType: { select: { name: true, baseRate: true, currency: true } },
        reservations: {
          where: {
            status: { in: ['confirmed', 'checked_in'] },
            checkInDate:  { lt: new Date(to)   },
            checkOutDate: { gt: new Date(from)  },
          },
          select: { checkInDate: true, checkOutDate: true, status: true, guest: { select: { name: true } } },
        },
      },
    });

    res.json({
      from, to,
      rooms: rooms.map(r => ({
        id:           r.id,
        number:       r.number,
        floor:        r.floor,
        room_type:    r.roomType.name,
        base_rate:    r.roomType.baseRate,
        currency:     r.roomType.currency,
        status:       r.status,
        reservations: r.reservations,
        is_available: r.reservations.length === 0 && r.status === 'available',
      })),
      available_count: rooms.filter(r => r.reservations.length === 0 && r.status === 'available').length,
      total_rooms:     rooms.length,
    });
  } catch (err) { next(err); }
});


// ── GROUP RESERVATIONS ────────────────────────────────────────────

router.get('/groups', auth, async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const groups = await prisma.reservationGroup.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status && { status }),
        ...(from   && { checkInDate:  { gte: new Date(from) } }),
        ...(to     && { checkOutDate: { lte: new Date(to)   } }),
      },
      include: {
        reservations: {
          include: {
            room:  { select: { number: true, roomType: { select: { name: true } } } },
            guest: { select: { name: true } },
          },
        },
        _count: { select: { reservations: true } },
      },
      orderBy: { checkInDate: 'asc' },
      take: 100,
    });
    res.json({ groups });
  } catch (err) { next(err); }
});

router.post('/groups', auth, requireRole('owner', 'manager'), validate(z.object({
  name:               z.string().trim().min(1).max(255),
  organiserName:      z.string().optional(),
  organiserPhone:     z.string().optional(),
  organiserEmail:     z.string().email().optional().nullable(),
  corporateAccountId: uuid.optional().nullable(),
  billingType:        z.enum(['individual','master','split']).default('individual'),
  groupRate:          money.optional().nullable(),
  currency:           z.string().length(3).default('USD'),
  checkInDate:        isoDate,
  checkOutDate:       isoDate,
  roomCount:          z.coerce.number().int().positive().default(1),
  pax:                z.coerce.number().int().positive().default(1),
  notes:              z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    const groupNum = 'GRP-' + Date.now().toString().slice(-8);
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.reservationGroup.create({
        data: {
          businessId:        req.user.business_id,
          groupNumber:       groupNum,
          name:              req.body.name,
          organiserName:     req.body.organiserName  || null,
          organiserPhone:    req.body.organiserPhone || null,
          organiserEmail:    req.body.organiserEmail || null,
          corporateAccountId: req.body.corporateAccountId || null,
          billingType:       req.body.billingType || 'individual',
          groupRate:         req.body.groupRate   || null,
          currency:          req.body.currency    || 'USD',
          checkInDate:       new Date(req.body.checkInDate),
          checkOutDate:      new Date(req.body.checkOutDate),
          roomCount:         req.body.roomCount   || 1,
          pax:               req.body.pax         || 1,
          notes:             req.body.notes       || null,
          createdById:       req.user.id,
        },
      });
      // Create master folio if billing type is master or split
      if (['master','split'].includes(req.body.billingType)) {
        // The folio's guest must be a real Customer (FK), not the operating
        // user. Materialise a customer record for the group organiser.
        const organiser = await tx.customer.create({
          data: {
            businessId: req.user.business_id,
            name:       req.body.organiserName || `${req.body.name} (group)`,
            phone:      req.body.organiserPhone || null,
            email:      req.body.organiserEmail || null,
          },
        });
        const folio = await tx.folio.create({
          data: {
            businessId:  req.user.business_id,
            folioNumber: folioNumber(),
            guestId:     organiser.id,
            currency:    req.body.currency || 'USD',
            notes:       `Master folio — Group ${groupNum}: ${req.body.name}`,
          },
        });
        await tx.reservationGroup.update({ where: { id: g.id }, data: { masterFolioId: folio.id } });
        g.masterFolioId = folio.id;
      }
      return g;
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});

router.get('/groups/:id', auth, async (req, res, next) => {
  try {
    const group = await prisma.reservationGroup.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        reservations: {
          include: {
            room:  { include: { roomType: { select: { name: true } } } },
            guest: { select: { name: true, phone: true, whatsapp: true } },
            folio: { select: { id: true, balance: true, status: true } },
          },
        },
      },
    });
    if (!group) return res.status(404).json({ title: 'Not found', status: 404 });

    // Attach all reservations to this group
    res.json({
      ...group,
      total_rooms:     group.reservations.length,
      checked_in:      group.reservations.filter(r => r.status === 'checked_in').length,
      total_revenue:   group.reservations.reduce((s, r) => s + parseFloat(r.totalRoomCharge), 0),
    });
  } catch (err) { next(err); }
});

// Add a reservation to an existing group
router.post('/groups/:id/reservations', auth, validate(z.object({
  reservationId: uuid,
})), async (req, res, next) => {
  try {
    const group = await prisma.reservationGroup.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    await prisma.reservation.update({
      where: { id: req.body.reservationId },
      data:  { groupId: req.params.id },
    });
    res.json({ message: 'Reservation added to group.' });
  } catch (err) { next(err); }
});

// Group check-in — check in all confirmed reservations in the group
router.post('/groups/:id/checkin', auth, async (req, res, next) => {
  try {
    const group = await prisma.reservationGroup.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { reservations: { where: { status: 'confirmed' }, include: { room: true, guest: true } } },
    });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (!group.reservations.length) return res.status(400).json({ error: 'No confirmed reservations to check in.' });

    const checked = [];
    for (const reservation of group.reservations) {
      await prisma.$transaction(async (tx) => {
        await tx.reservation.update({ where: { id: reservation.id }, data: { status: 'checked_in', actualCheckIn: new Date(), checkedInById: req.user.id } });
        await tx.room.update({ where: { id: reservation.roomId }, data: { status: 'occupied' } });
        // Create individual folio unless master billing
        if (group.billingType === 'individual') {
          await tx.folio.create({ data: { businessId: req.user.business_id, folioNumber: folioNumber(), reservationId: reservation.id, guestId: reservation.guestId, currency: reservation.currency } });
        }
      });
      checked.push({ reservation_number: reservation.reservationNumber, room: reservation.room.number, guest: reservation.guest.name });
    }

    await prisma.reservationGroup.update({ where: { id: req.params.id }, data: { status: 'checked_in' } });
    res.json({ message: `${checked.length} guests checked in.`, checked });
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

// ── HOTEL SETTINGS ────────────────────────────────────────────────

router.get('/settings', auth, async (req, res, next) => {
  try {
    const settings = await prisma.hotelSettings.findUnique({
      where: { businessId: req.user.business_id },
    });
    // Return defaults if not configured yet
    res.json(settings || {
      checkInTime:         '14:00',
      checkOutTime:        '11:00',
      earlyCheckInFee:     0,
      lateCheckOutFee:     0,
      depositPct:          0,
      autoPostRoomCharges: true,
      requireDepositOnBook: false,
    });
  } catch (err) { next(err); }
});

router.put('/settings', auth, requireRole('owner'), validate(z.object({
  checkInTime:          z.string().regex(/^\d{2}:\d{2}$/).optional(),
  checkOutTime:         z.string().regex(/^\d{2}:\d{2}$/).optional(),
  earlyCheckInFee:      money.optional().nullable(),
  lateCheckOutFee:      money.optional().nullable(),
  currency:             z.string().length(3).optional(),
  taxRate:              z.coerce.number().min(0).max(1).optional().nullable(),
  serviceChargePct:     z.coerce.number().min(0).max(1).optional().nullable(),
  depositPct:           z.coerce.number().min(0).max(1).optional().nullable(),
  nightAuditTime:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
  autoPostRoomCharges:  z.boolean().optional(),
  requireDepositOnBook: z.boolean().optional(),
  allowOverbooking:     z.boolean().optional(),
  wifiPassword:         z.string().max(100).optional().nullable(),
  checkInWelcomeMsg:    z.string().optional().nullable(),
  checkOutThankYouMsg:  z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    const settings = await prisma.hotelSettings.upsert({
      where:  { businessId: req.user.business_id },
      create: { businessId: req.user.business_id, ...req.body },
      update: req.body,
    });
    res.json(settings);
  } catch (err) { next(err); }
});

// ── LOST AND FOUND ─────────────────────────────────────────────────

router.get('/lost-found', auth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const items = await prisma.lostFound.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status && { status }),
      },
      include: {
        guest:   { select: { name: true, phone: true } },
        foundBy: { select: { name: true } },
      },
      orderBy: { foundDate: 'desc' },
      take: 100,
    });
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/lost-found', auth, validate(z.object({
  itemName:        z.string().trim().min(1).max(255),
  description:     z.string().optional(),
  foundDate:       isoDate,
  foundLocation:   z.string().max(255).optional(),
  guestId:         uuid.optional().nullable(),
  storageLocation: z.string().max(100).optional(),
  notes:           z.string().optional(),
})), async (req, res, next) => {
  try {
    const item = await prisma.lostFound.create({
      data: {
        businessId:      req.user.business_id,
        itemName:        req.body.itemName,
        description:     req.body.description || null,
        foundDate:       new Date(req.body.foundDate),
        foundLocation:   req.body.foundLocation || null,
        foundById:       req.user.id,
        guestId:         req.body.guestId || null,
        storageLocation: req.body.storageLocation || null,
        notes:           req.body.notes || null,
      },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

router.put('/lost-found/:id', auth, validate(z.object({
  status:          z.enum(['in_storage','claimed','donated','disposed']).optional(),
  guestId:         uuid.optional().nullable(),
  storageLocation: z.string().optional(),
  notes:           z.string().optional(),
})), async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.body.status === 'claimed') {
      data.claimedById = req.user.id;
      data.claimedAt   = new Date();
    }
    const item = await prisma.lostFound.update({ where: { id: req.params.id }, data });
    res.json(item);
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
