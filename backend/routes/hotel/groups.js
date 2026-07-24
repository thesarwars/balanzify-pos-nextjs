// Group reservations.

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

module.exports = router;
