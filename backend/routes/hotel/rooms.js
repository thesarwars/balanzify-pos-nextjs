// Room types, rate plans, rooms and housekeeping.

const express = require('express');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  uuid, money, isoDate,
  RoomTypeSchema, RoomSchema, RatePlanSchema, ReservationSchema, FolioChargeSchema, FolioPaymentSchema,
  nightsBetween, reservationNumber, folioNumber, asFraction, bookPenalty, resolveBestRate,
} = require('./_shared');

const router = express.Router();

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

module.exports = router;
