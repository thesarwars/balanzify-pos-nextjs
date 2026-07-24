// Night audit, revenue analytics, dashboard and availability/quote.

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

// ── DASHBOARD ─────────────────────────────────────────────────────

// ── NIGHT AUDIT ───────────────────────────────────────────────────
// The end-of-day close. Sweeps arrivals that never checked in to no-show
// (applying the no-show fee), then returns the day's reconciliation snapshot.
// Idempotent: only still-confirmed past arrivals are processed.
router.post('/night-audit/run', auth, requireRole('owner', 'manager'), validate(z.object({
  date: isoDate.optional(),
})), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const auditDate = req.body.date ? new Date(req.body.date) : new Date();
    const dayStart = new Date(auditDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(dayStart.getTime() + 86400000);

    const settings = await prisma.hotelSettings.findUnique({ where: { businessId: bizId } });
    const feePct = asFraction(settings?.noShowFeePct);

    // Arrivals due on/before the audit date that never checked in → no-show.
    const stale = await prisma.reservation.findMany({
      where: { businessId: bizId, status: 'confirmed', checkInDate: { lt: dayEnd } },
    });
    const noShows = [];
    for (const resv of stale) {
      const penalty = feePct > 0 ? parseFloat((parseFloat(resv.totalRoomCharge || 0) * feePct).toFixed(2)) : 0;
      const money = await prisma.$transaction(async (tx) => {
        const m = await bookPenalty(tx, { businessId: bizId, reservation: resv, penalty, label: 'No-show fee', userId: req.user.id });
        await tx.reservation.update({ where: { id: resv.id }, data: { status: 'no_show' } });
        await tx.room.update({ where: { id: resv.roomId }, data: { status: 'available' } });
        return m;
      });
      noShows.push({ reservation_id: resv.id, number: resv.reservationNumber, penalty: money.penalty });
    }

    // Daily reconciliation snapshot.
    const [arrivals, departures, inHouse, roomRevenue, payments] = await Promise.all([
      prisma.reservation.count({ where: { businessId: bizId, checkInDate: { gte: dayStart, lt: dayEnd } } }),
      prisma.reservation.count({ where: { businessId: bizId, checkOutDate: { gte: dayStart, lt: dayEnd } } }),
      prisma.reservation.count({ where: { businessId: bizId, status: 'checked_in' } }),
      prisma.folioCharge.aggregate({ where: { businessId: bizId, type: 'room_night', isVoid: false, chargeDate: { gte: dayStart, lt: dayEnd } }, _sum: { totalAmount: true } }),
      prisma.folioPayment.aggregate({ where: { businessId: bizId, createdAt: { gte: dayStart, lt: dayEnd } }, _sum: { amount: true } }),
    ]);

    res.json({
      audit_date: dayStart.toISOString().slice(0, 10),
      no_shows_processed: noShows.length,
      no_shows: noShows,
      arrivals, departures, in_house: inHouse,
      room_revenue: parseFloat(roomRevenue._sum.totalAmount || 0),
      payments_collected: parseFloat(payments._sum.amount || 0),
    });
  } catch (err) { next(err); }
});

// ── REVENUE ANALYTICS (occupancy / ADR / RevPAR) ──────────────────
router.get('/reports/revenue', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD).' });
    const fromD = new Date(from); fromD.setHours(0, 0, 0, 0);
    const toD   = new Date(to);   toD.setHours(0, 0, 0, 0);
    const days  = Math.max(1, Math.round((toD - fromD) / 86400000) + 1); // inclusive
    const rangeEnd = new Date(toD.getTime() + 86400000);

    const [activeRooms, roomNightAgg, arrivals, departures, noShows, cancellations] = await Promise.all([
      prisma.room.count({ where: { businessId: bizId, isActive: true } }),
      prisma.folioCharge.aggregate({
        where: { businessId: bizId, type: 'room_night', isVoid: false, chargeDate: { gte: fromD, lt: rangeEnd } },
        _sum: { totalAmount: true, quantity: true },
      }),
      prisma.reservation.count({ where: { businessId: bizId, checkInDate: { gte: fromD, lt: rangeEnd } } }),
      prisma.reservation.count({ where: { businessId: bizId, checkOutDate: { gte: fromD, lt: rangeEnd } } }),
      prisma.reservation.count({ where: { businessId: bizId, status: 'no_show', updatedAt: { gte: fromD, lt: rangeEnd } } }),
      prisma.reservation.count({ where: { businessId: bizId, status: 'cancelled', updatedAt: { gte: fromD, lt: rangeEnd } } }),
    ]);

    const roomRevenue   = parseFloat(roomNightAgg._sum.totalAmount || 0);
    const roomNightsSold = parseFloat(roomNightAgg._sum.quantity || 0);
    const availableRoomNights = activeRooms * days;
    const occupancyPct = availableRoomNights > 0 ? +((roomNightsSold / availableRoomNights) * 100).toFixed(1) : 0;
    const adr    = roomNightsSold > 0 ? +(roomRevenue / roomNightsSold).toFixed(2) : 0;       // Average Daily Rate
    const revpar = availableRoomNights > 0 ? +(roomRevenue / availableRoomNights).toFixed(2) : 0; // Revenue Per Available Room

    res.json({
      period: { from: fromD.toISOString().slice(0, 10), to: toD.toISOString().slice(0, 10), days },
      rooms: activeRooms,
      available_room_nights: availableRoomNights,
      room_nights_sold: roomNightsSold,
      room_revenue: +roomRevenue.toFixed(2),
      occupancy_pct: occupancyPct,
      adr, revpar,
      arrivals, departures, no_shows: noShows, cancellations,
    });
  } catch (err) { next(err); }
});

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

module.exports = router;
