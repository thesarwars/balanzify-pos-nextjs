// Shared hotel validation schemas and helpers (rate resolution, folio penalty
// posting, numbering). Required by the hotel route modules.
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');

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

const asFraction = (v) => { const n = parseFloat(v || 0); return n > 1 ? n / 100 : n; }; // accept 5 or 0.05

// Book a cancellation / no-show penalty onto a folio: the fee is revenue (Dr AR /
// Cr revenue), any pre-paid deposit is applied against it, and the rest of the
// deposit is flagged as refund-due. Returns the money breakdown. Runs inside a tx.
async function bookPenalty(tx, { businessId, reservation, penalty, label, userId }) {
  const deposit = parseFloat(reservation.depositPaid || 0);
  const fee = parseFloat((penalty || 0).toFixed(2));
  // Nothing to book and nothing to refund — skip the folio entirely.
  if (fee <= 0 && deposit <= 0) return { penalty: 0, deposit, applied: 0, refund_due: 0, amount_owed: 0 };

  const folio = await tx.folio.create({
    data: { businessId, folioNumber: folioNumber(), reservationId: reservation.id, guestId: reservation.guestId, currency: reservation.currency },
  });
  if (fee > 0) {
    await tx.folioCharge.create({ data: {
      folioId: folio.id, businessId, type: 'other', description: label,
      quantity: 1, unitAmount: fee, totalAmount: fee, currency: reservation.currency, chargeDate: new Date(),
    } });
    await tx.folio.update({ where: { id: folio.id }, data: { totalCharges: { increment: fee }, balance: { increment: fee } } });
    await accounting.postFolioCharge(tx, { businessId, type: 'other', amount: fee, description: label, sourceId: folio.id, createdById: userId });
  }
  const applied = Math.min(deposit, fee);
  if (applied > 0) {
    // Apply the deposit against the fee (cash already in hand → settles AR).
    await tx.folioPayment.create({ data: {
      folioId: folio.id, businessId, provider: 'deposit', amount: applied, currency: reservation.currency,
      notes: 'Deposit applied to ' + label, receivedById: userId,
    } });
    await tx.folio.update({ where: { id: folio.id }, data: { totalPayments: { increment: applied }, balance: { decrement: applied } } });
    await accounting.postFolioPayment(tx, { businessId, method: 'deposit', amount: applied, sourceId: folio.id, createdById: userId });
  }
  const balance = parseFloat((fee - applied).toFixed(2));
  await tx.folio.update({ where: { id: folio.id }, data: { status: balance <= 0 ? 'settled' : 'pending', settledAt: balance <= 0 ? new Date() : null, settledById: balance <= 0 ? userId : null } });
  return {
    folio_id: folio.id,
    penalty: fee,
    deposit,
    applied,
    refund_due: parseFloat(Math.max(0, deposit - fee).toFixed(2)),
    amount_owed: balance,
  };
}

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

module.exports = {
  uuid, money, isoDate,
  RoomTypeSchema, RoomSchema, RatePlanSchema, ReservationSchema, FolioChargeSchema, FolioPaymentSchema,
  nightsBetween, reservationNumber, folioNumber, asFraction, bookPenalty, resolveBestRate,
};
