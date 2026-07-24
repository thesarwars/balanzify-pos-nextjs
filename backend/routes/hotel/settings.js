// Hotel settings and lost & found.

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
  tourismLevyPct:       z.coerce.number().min(0).max(1).optional().nullable(),
  depositPct:           z.coerce.number().min(0).max(1).optional().nullable(),
  nightAuditTime:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
  autoPostRoomCharges:  z.boolean().optional(),
  requireDepositOnBook: z.boolean().optional(),
  allowOverbooking:     z.boolean().optional(),
  cancellationDeadlineHours: z.coerce.number().int().min(0).max(720).optional(),
  cancellationFeePct:   z.coerce.number().min(0).max(1).optional().nullable(),
  noShowFeePct:         z.coerce.number().min(0).max(1).optional().nullable(),
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

module.exports = router;
