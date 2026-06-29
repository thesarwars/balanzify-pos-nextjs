/**
 * Pharmacy Routes — Balanzify Pharmacy module.
 *
 * Designed for African pharmacy retail reality (Somaliland, Somalia, Kenya,
 * Ethiopia): the #1 value driver is EXPIRY-LOSS PREVENTION (market leaders
 * headline "75% reduction in expired stock losses"), and partial-pack / unit
 * dispensing is the documented norm (~83% of Ethiopian outlets dispense
 * partial regimens). Prescription tracking is OPTIONAL metadata, not a gate —
 * enforcement varies by market (see lib/markets.js pharmacyCompliance).
 *
 * Design principle (per company policy): features help the pharmacist run a
 * CLEANER, more profitable operation — sell stock BEFORE it expires, pull what
 * has expired. The system surfaces expiry prominently and never hides it.
 *
 * GET  /api/v1/pharmacy/dashboard          — expiry exposure + today's numbers
 * GET  /api/v1/pharmacy/expiry             — expiring/expired stock report
 * GET  /api/v1/pharmacy/drugs              — drug catalog (search by name/generic)
 * PUT  /api/v1/pharmacy/drugs/:id          — set drug fields + unit-selling config
 * POST /api/v1/pharmacy/dispense-check     — pre-sale helper: resolve pack vs units
 * GET  /api/v1/pharmacy/fast-movers        — top sellers + reorder urgency
 * POST /api/v1/pharmacy/pull-expired       — write off expired batch (audit-trailed)
 */

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const interactions = require('../lib/druginteractions');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const uuid = z.string().uuid();

// ── DASHBOARD ─────────────────────────────────────────────────────
// The morning screen: what expires soon, what's already expired,
// how much money is at risk, what sold today.

router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const in90 = new Date(now.getTime() + 90 * 86400000);
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

    const [expired, expiring30, expiring90, salesToday] = await Promise.all([
      // Already expired, still showing stock — must be pulled
      prisma.stockBatch.findMany({
        where: { product: { businessId: bizId }, expiryDate: { lt: now }, quantity: { gt: 0 } },
        include: { product: { select: { name: true, genericName: true, costPrice: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      }),
      prisma.stockBatch.aggregate({
        where: { product: { businessId: bizId }, expiryDate: { gte: now, lt: in30 }, quantity: { gt: 0 } },
        _count: { id: true },
      }),
      prisma.stockBatch.aggregate({
        where: { product: { businessId: bizId }, expiryDate: { gte: in30, lt: in90 }, quantity: { gt: 0 } },
        _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { businessId: bizId, createdAt: { gte: todayStart }, status: 'completed' },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ]);

    // Money at risk = remaining qty x cost for expired batches
    const expiredValue = expired.reduce(
      (s, b) => s + b.quantity * parseFloat(b.product?.costPrice || 0), 0);

    res.json({
      expiry_exposure: {
        expired_batches: expired.length,
        expired_value_at_cost: parseFloat(expiredValue.toFixed(2)),
        expiring_30_days: expiring30._count.id,
        expiring_90_days: expiring90._count.id,
        action_needed: expired.length > 0
          ? 'Pull expired stock from shelves — see /pharmacy/expiry'
          : null,
      },
      today: {
        sales: salesToday._count.id,
        revenue: parseFloat(salesToday._sum.totalAmount || 0),
      },
      expired_items: expired.slice(0, 10).map(b => ({
        batch_id: b.id,
        product: b.product?.name,
        generic: b.product?.genericName,
        expired_on: b.expiryDate,
        quantity: b.quantity,
        batch_number: b.batchNumber,
      })),
    });
  } catch (err) { next(err); }
});

// ── EXPIRY REPORT ─────────────────────────────────────────────────
// Full expiring/expired list with windows. The feature that pays for
// the product: sell it before it dies, pull it when it has.

router.get('/expiry', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const days = Math.min(parseInt(req.query.days || '90', 10), 365);
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 86400000);

    const batches = await prisma.stockBatch.findMany({
      where: {
        product: { businessId: bizId },
        expiryDate: { lt: horizon, not: null },
        quantity: { gt: 0 },
      },
      include: {
        product: { select: { id: true, name: true, genericName: true, strength: true, sellingPrice: true, costPrice: true, sellByUnit: true, packSize: true } },
      },
      orderBy: { expiryDate: 'asc' },
      take: 500,
    });

    const enriched = batches.map(b => {
      const daysLeft = Math.floor((new Date(b.expiryDate) - now) / 86400000);
      return {
        batch_id: b.id,
        batch_number: b.batchNumber,
        product_id: b.product?.id,
        product: b.product?.name,
        generic: b.product?.genericName,
        strength: b.product?.strength,
        quantity_remaining: b.quantity,
        expiry_date: b.expiryDate,
        days_left: daysLeft,
        status: daysLeft < 0 ? 'EXPIRED' : daysLeft <= 30 ? 'URGENT' : daysLeft <= 90 ? 'SOON' : 'OK',
        value_at_cost: parseFloat((b.quantity * parseFloat(b.product?.costPrice || 0)).toFixed(2)),
        suggestion: daysLeft < 0
          ? 'Pull from shelf and write off'
          : daysLeft <= 30
            ? 'Discount to move before expiry'
            : 'Sell first (FIFO)',
      };
    });

    res.json({
      horizon_days: days,
      total_value_at_risk: parseFloat(enriched.reduce((s, b) => s + b.value_at_cost, 0).toFixed(2)),
      expired: enriched.filter(b => b.status === 'EXPIRED'),
      urgent_30d: enriched.filter(b => b.status === 'URGENT'),
      soon_90d: enriched.filter(b => b.status === 'SOON'),
    });
  } catch (err) { next(err); }
});

// ── DRUG CATALOG ──────────────────────────────────────────────────
// Search by brand OR generic name — pharmacists think in both.

router.get('/drugs', auth, async (req, res, next) => {
  try {
    const { q, formulation, prescription_only } = req.query;
    const drugs = await prisma.product.findMany({
      where: {
        businessId: req.user.business_id,
        isActive: true,
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { genericName: { contains: q, mode: 'insensitive' } },
            { barcode: { equals: q } },
          ],
        }),
        ...(formulation && { formulation }),
        ...(prescription_only === 'true' && { isPrescriptionDrug: true }),
      },
      select: {
        id: true, name: true, genericName: true, strength: true,
        formulation: true, manufacturer: true, isPrescriptionDrug: true,
        sellingPrice: true, packSize: true, sellByUnit: true,
        unitName: true, unitPrice: true, barcode: true,
        controlledSchedule: true, reorderPoint: true,
        stockLevels: { select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    res.json({
      drugs: drugs.map(d => ({
        ...d,
        total_stock: d.stockLevels.reduce((s, l) => s + l.quantity, 0),
        stockLevels: undefined,
      })),
    });
  } catch (err) { next(err); }
});

// ── DRUG FIELDS + UNIT-SELLING CONFIG ─────────────────────────────

router.put('/drugs/:id', auth, requireRole('owner', 'manager'), validate(z.object({
  genericName:        z.string().max(255).optional().nullable(),
  strength:           z.string().max(50).optional().nullable(),
  formulation:        z.enum(['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'suppository', 'other']).optional().nullable(),
  manufacturer:       z.string().max(255).optional().nullable(),
  barcode:            z.string().max(100).optional().nullable(),
  isPrescriptionDrug: z.boolean().optional(),
  controlledSchedule: z.string().max(10).optional().nullable(),
  reorderPoint:       z.coerce.number().int().nonnegative().max(1000000).optional(),
  packSize:           z.coerce.number().int().positive().max(10000).optional().nullable(),
  sellByUnit:         z.boolean().optional(),
  unitName:           z.string().max(30).optional().nullable(),
  unitPrice:          z.coerce.number().nonnegative().optional().nullable(),
})), async (req, res, next) => {
  try {
    // Guard: unit selling needs packSize + unitPrice to make sense
    if (req.body.sellByUnit === true) {
      const current = await prisma.product.findFirst({
        where: { id: req.params.id, businessId: req.user.business_id },
        select: { packSize: true, unitPrice: true },
      });
      if (!current) return res.status(404).json({ title: 'Not found', status: 404 });
      const packSize = req.body.packSize ?? current.packSize;
      const unitPrice = req.body.unitPrice ?? current.unitPrice;
      if (!packSize || !unitPrice) {
        return res.status(400).json({
          title: 'Unit selling needs configuration',
          status: 400,
          detail: 'Set packSize (units per pack) and unitPrice before enabling sellByUnit.',
        });
      }
    }

    const updated = await prisma.product.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: req.body,
    });
    if (!updated.count) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(await prisma.product.findUnique({ where: { id: req.params.id } }));
  } catch (err) { next(err); }
});

// ── CREATE DRUG ───────────────────────────────────────────────────
// Add a new drug (a Product with pharmacy fields) straight from Pharmacy,
// without leaving for the general Products screen.
router.post('/drugs', auth, requireRole('owner', 'manager'), validate(z.object({
  name:               z.string().trim().min(1).max(255),
  genericName:        z.string().max(255).optional().nullable(),
  strength:           z.string().max(50).optional().nullable(),
  formulation:        z.enum(['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'suppository', 'other']).optional().nullable(),
  manufacturer:       z.string().max(255).optional().nullable(),
  barcode:            z.string().max(100).optional().nullable(),
  sellingPrice:       z.coerce.number().nonnegative().default(0),
  costPrice:          z.coerce.number().nonnegative().default(0),
  isPrescriptionDrug: z.boolean().default(false),
  controlledSchedule: z.string().max(10).optional().nullable(),
  reorderPoint:       z.coerce.number().int().nonnegative().max(1000000).default(0),
  trackExpiry:        z.boolean().default(true),
})), async (req, res, next) => {
  try {
    const b = req.body;
    const drug = await prisma.product.create({
      data: {
        businessId: req.user.business_id, name: b.name,
        genericName: b.genericName || null, strength: b.strength || null,
        formulation: b.formulation || null, manufacturer: b.manufacturer || null,
        barcode: b.barcode || null, sellingPrice: b.sellingPrice, costPrice: b.costPrice,
        isPrescriptionDrug: b.isPrescriptionDrug, controlledSchedule: b.controlledSchedule || null,
        reorderPoint: b.reorderPoint, trackExpiry: b.trackExpiry,
      },
      select: { id: true, name: true, genericName: true, strength: true, formulation: true, isPrescriptionDrug: true, sellingPrice: true, barcode: true },
    });
    res.status(201).json(drug);
  } catch (err) { next(err); }
});

// ── RECEIVE BATCH ─────────────────────────────────────────────────
// Take a batch into stock with its expiry date — the input that feeds the
// expiry report and on-hand. Creates the batch, bumps the location's stock
// level, and records the inbound movement.
router.post('/batches', auth, requireRole('owner', 'manager'), validate(z.object({
  product_id:   uuid,
  location_id:  uuid,
  batch_number: z.string().max(100).optional().nullable(),
  quantity:     z.coerce.number().int().positive(),
  cost_price:   z.coerce.number().nonnegative().default(0),
  expiry_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})), async (req, res, next) => {
  try {
    const b = req.body;
    const drug = await prisma.product.findFirst({ where: { id: b.product_id, businessId: req.user.business_id }, select: { id: true, name: true } });
    if (!drug) return res.status(404).json({ error: 'Drug not found.' });
    const loc = await prisma.location.findFirst({ where: { id: b.location_id, businessId: req.user.business_id }, select: { id: true } });
    if (!loc) return res.status(404).json({ error: 'Location not found.' });

    const out = await prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          productId: b.product_id, locationId: b.location_id, batchNumber: b.batch_number || null,
          quantity: b.quantity, costPrice: b.cost_price, expiryDate: b.expiry_date ? new Date(b.expiry_date) : null,
        },
      });
      const level = await tx.stockLevel.upsert({
        where: { productId_locationId: { productId: b.product_id, locationId: b.location_id } },
        create: { productId: b.product_id, locationId: b.location_id, quantity: b.quantity },
        update: { quantity: { increment: b.quantity } },
      });
      await tx.stockMovement.create({
        data: { businessId: req.user.business_id, productId: b.product_id, locationId: b.location_id, type: 'in', quantity: b.quantity, balanceAfter: level.quantity, referenceType: 'batch_receipt', referenceId: batch.id, createdById: req.user.id },
      });
      // An expiry-dated receipt implies the product should appear in the expiry report.
      if (b.expiry_date) await tx.product.update({ where: { id: b.product_id }, data: { trackExpiry: true } });
      return { batch, onHand: level.quantity };
    });
    res.status(201).json({ message: `Received ${b.quantity} of ${drug.name}.`, batch_id: out.batch.id, on_hand: out.onHand });
  } catch (err) { next(err); }
});

// ── DISPENSE CHECK ────────────────────────────────────────────────
// Pre-sale helper: given a product and a requested quantity in units or
// packs, returns the priced line + the FIFO batch to dispense from (oldest
// expiry first) + an expiry warning the cashier sees BEFORE selling.

router.post('/dispense-check', auth, validate(z.object({
  product_id: uuid,
  quantity:   z.coerce.number().positive(),
  unit_type:  z.enum(['pack', 'unit']).default('pack'),
})), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.body.product_id, businessId: req.user.business_id, isActive: true },
      select: {
        id: true, name: true, genericName: true, strength: true,
        sellingPrice: true, packSize: true, sellByUnit: true,
        unitName: true, unitPrice: true, trackExpiry: true,
      },
    });
    if (!product) return res.status(404).json({ title: 'Product not found', status: 404 });

    if (req.body.unit_type === 'unit' && !product.sellByUnit) {
      return res.status(400).json({
        title: 'Unit selling not enabled',
        status: 400,
        detail: `${product.name} is sold by pack only. Enable sellByUnit in the drug settings to dispense individual ${product.unitName || 'units'}.`,
      });
    }

    // Price the line
    const isUnit = req.body.unit_type === 'unit';
    const price = isUnit ? parseFloat(product.unitPrice) : parseFloat(product.sellingPrice);
    const lineTotal = parseFloat((price * req.body.quantity).toFixed(2));

    // FIFO batch suggestion: oldest expiry with stock, plus warning
    let batch = null, warning = null;
    if (product.trackExpiry) {
      const now = new Date();
      batch = await prisma.stockBatch.findFirst({
        where: { product: { businessId: req.user.business_id }, productId: product.id, quantity: { gt: 0 }, expiryDate: { not: null } },
        orderBy: { expiryDate: 'asc' },
        select: { id: true, batchNumber: true, expiryDate: true, quantity: true, locationId: true },
      });
      if (batch) {
        const daysLeft = Math.floor((new Date(batch.expiryDate) - now) / 86400000);
        if (daysLeft < 0) {
          warning = { level: 'EXPIRED', message: `Oldest batch ${batch.batchNumber || ''} EXPIRED ${Math.abs(daysLeft)} days ago. Do not dispense — pull this batch and use the next one.` };
        } else if (daysLeft <= 30) {
          warning = { level: 'EXPIRING', message: `Dispense from batch ${batch.batchNumber || ''} first — it expires in ${daysLeft} days.` };
        }
      }
    }

    res.json({
      product: { id: product.id, name: product.name, generic: product.genericName, strength: product.strength },
      unit_type: req.body.unit_type,
      quantity: req.body.quantity,
      unit_label: isUnit ? (product.unitName || 'unit') : 'pack',
      price_each: price,
      line_total: lineTotal,
      // For unit sales: stock is decremented in base units (quantity),
      // for pack sales: decremented by quantity * packSize when packSize set.
      stock_units_to_deduct: isUnit ? req.body.quantity : req.body.quantity * (product.packSize || 1),
      fifo_batch: batch,
      expiry_warning: warning,
    });
  } catch (err) { next(err); }
});

// ── DRUG INTERACTIONS ─────────────────────────────────────────────

// The generic (or trade) names of a patient's other active medications — the
// basket we check a new drug against. Patient is matched by id when present,
// otherwise by name (walk-in patients without a record).
async function patientDrugNames(businessId, { patientId, patientName, excludeRxId } = {}) {
  if (!patientId && !patientName) return [];
  const rxs = await prisma.prescription.findMany({
    where: {
      businessId, status: 'active',
      ...(excludeRxId && { id: { not: excludeRxId } }),
      ...(patientId ? { patientId } : { patientName }),
    },
    include: { product: { select: { name: true, genericName: true } } },
    take: 100,
  });
  return rxs.map(r => r.product?.genericName || r.product?.name).filter(Boolean);
}

// Ad-hoc interaction check: pass explicit drug names, product_ids, and/or a
// patient to fold in their active medications.
router.post('/interactions/check', auth, validate(z.object({
  drugs: z.array(z.string().max(120)).optional(),
  product_ids: z.array(uuid).optional(),
  patient_id: uuid.optional().nullable(),
  patient_name: z.string().max(255).optional().nullable(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const names = [...(req.body.drugs || [])];
    if (req.body.product_ids?.length) {
      const prods = await prisma.product.findMany({ where: { id: { in: req.body.product_ids }, businessId }, select: { name: true, genericName: true } });
      names.push(...prods.map(p => p.genericName || p.name));
    }
    if (req.body.patient_id || req.body.patient_name) {
      names.push(...await patientDrugNames(businessId, { patientId: req.body.patient_id, patientName: req.body.patient_name }));
    }
    const found = await interactions.check(businessId, names);
    res.json({ checked: [...new Set(names.map(n => n.trim()).filter(Boolean))], interactions: found, has_contraindication: interactions.hasContraindication(found) });
  } catch (err) { next(err); }
});

// Browse the knowledge base (shipped + this business's custom rows).
router.get('/interactions', auth, async (req, res, next) => {
  try {
    const rows = await prisma.drugInteraction.findMany({
      where: { OR: [{ businessId: null }, { businessId: req.user.business_id }] },
      orderBy: [{ drugA: 'asc' }, { drugB: 'asc' }], take: 500,
    });
    res.json({ interactions: rows.map(r => ({ id: r.id, drug_a: r.drugA, drug_b: r.drugB, severity: r.severity, description: r.description, custom: r.businessId != null })) });
  } catch (err) { next(err); }
});

// Add a business-specific interaction (e.g. a local formulary rule).
router.post('/interactions', auth, requireRole('owner', 'manager'), validate(z.object({
  drug_a: z.string().trim().min(1).max(120),
  drug_b: z.string().trim().min(1).max(120),
  severity: z.enum(['minor', 'moderate', 'major', 'contraindicated']),
  description: z.string().trim().min(1).max(1000),
})), async (req, res, next) => {
  try {
    const [a, b] = [req.body.drug_a, req.body.drug_b].map(s => s.trim().toLowerCase()).sort();
    const row = await prisma.drugInteraction.create({
      data: { businessId: req.user.business_id, drugA: a, drugB: b, severity: req.body.severity, description: req.body.description },
    });
    res.status(201).json({ id: row.id, drug_a: row.drugA, drug_b: row.drugB, severity: row.severity, description: row.description });
  } catch (err) { next(err); }
});

// DELETE /api/v1/pharmacy/interactions/:id — remove one of this business's own
// custom entries. Shipped clinical KB rows have business_id NULL and are scoped
// out of the delete, so they can never be removed here.
router.delete('/interactions/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    if (!/^[0-9a-fA-F-]{36}$/.test(req.params.id)) return res.status(404).json({ error: 'Custom interaction not found.' });
    const r = await prisma.drugInteraction.deleteMany({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (r.count === 0) return res.status(404).json({ error: 'Custom interaction not found.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── FAST MOVERS / REORDER URGENCY ────────────────────────────────

router.get('/fast-movers', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const days = Math.min(parseInt(req.query.days || '30', 10), 365);
    const since = new Date(Date.now() - days * 86400000);

    const movers = await prisma.$queryRaw`
      SELECT p.id, p.name, p.generic_name,
             SUM(si.quantity)::int AS qty_sold,
             ROUND(SUM(si.line_total)::numeric, 2) AS revenue,
             COALESCE(SUM(sl.quantity), 0)::int AS stock_on_hand,
             ROUND((SUM(si.quantity)::numeric / ${days}), 2) AS daily_velocity
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE s.business_id = ${bizId}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${since}
      GROUP BY p.id, p.name, p.generic_name
      ORDER BY qty_sold DESC
      LIMIT 25
    `;

    res.json({
      period_days: days,
      fast_movers: movers.map(m => ({
        ...m,
        days_of_stock_left: m.daily_velocity > 0
          ? Math.floor(m.stock_on_hand / parseFloat(m.daily_velocity))
          : null,
        reorder_urgency: m.daily_velocity > 0 && (m.stock_on_hand / parseFloat(m.daily_velocity)) < 7
          ? 'ORDER NOW' : null,
      })),
    });
  } catch (err) { next(err); }
});

// ── PULL EXPIRED (write-off with audit trail) ─────────────────────

router.post('/pull-expired', auth, requireRole('owner', 'manager'), validate(z.object({
  batch_id: uuid,
  notes:    z.string().max(500).optional(),
})), async (req, res, next) => {
  try {
    const batch = await prisma.stockBatch.findFirst({
      where: { id: req.body.batch_id, product: { businessId: req.user.business_id }, quantity: { gt: 0 } },
      include: { product: { select: { id: true, name: true, costPrice: true } } },
      // locationId is a scalar on the batch
    });
    if (!batch) return res.status(404).json({ title: 'Batch not found or already empty', status: 404 });
    if (new Date(batch.expiryDate) > new Date()) {
      return res.status(400).json({ title: 'Batch has not expired', status: 400, detail: 'Use a stock adjustment for non-expiry write-offs.' });
    }

    const qty = batch.quantity;
    const writeOffValue = qty * parseFloat(batch.product?.costPrice || 0);

    await prisma.$transaction(async (tx) => {
      await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: 0 } });
      await tx.stockLevel.updateMany({
        where: { productId: batch.product.id, locationId: batch.locationId },
        data: { quantity: { decrement: qty } },
      });
      await tx.stockAdjustment.create({
        data: {
          businessId: req.user.business_id,
          productId:  batch.product.id,
          locationId: batch.locationId,
          type:       'expiry',
          quantity:   qty,
          unitCost:   batch.product?.costPrice || 0,
          totalValue: writeOffValue,
          status:     'approved',
          reason:     `Expired batch ${batch.batchNumber || batch.id} pulled. ${req.body.notes || ''}`.trim(),
          approvedById: req.user.id,
          approvedAt: new Date(),
          createdById: req.user.id,
        },
      });
    });

    res.json({
      message: `${qty} units of ${batch.product.name} written off (expired batch pulled).`,
      write_off_value_at_cost: parseFloat(writeOffValue.toFixed(2)),
    });
  } catch (err) { next(err); }
});

// ── PRESCRIPTIONS & DISPENSING ────────────────────────────────────

// Create a prescription (the clinical record an Rx drug is dispensed against).
router.post('/prescriptions', auth, requireRole('owner', 'manager'), validate(z.object({
  product_id:         uuid,
  patient_id:         uuid.optional().nullable(),
  patient_name:       z.string().trim().min(1).max(255),
  patient_phone:      z.string().max(50).optional().nullable(),
  prescriber_name:    z.string().trim().min(1).max(255),
  prescriber_reg:     z.string().max(100).optional().nullable(),
  sig:                z.string().max(500).optional().nullable(),
  quantity:           z.coerce.number().int().positive(),
  refills_authorized: z.coerce.number().int().min(0).max(12).default(0),
  daw:                z.boolean().default(false),
  days_supply:        z.coerce.number().int().positive().max(365).optional().nullable(),
  valid_days:         z.coerce.number().int().positive().max(730).default(180), // Rx validity window
  allergies:          z.array(z.string().trim().min(1).max(100)).max(50).default([]),
})), async (req, res, next) => {
  try {
    const b = req.body;
    const drug = await prisma.product.findFirst({ where: { id: b.product_id, businessId: req.user.business_id }, select: { id: true } });
    if (!drug) return res.status(404).json({ error: 'Drug not found.' });
    const validUntil = new Date(Date.now() + b.valid_days * 86400000);
    const rx = await prisma.prescription.create({
      data: {
        businessId: req.user.business_id, rxNumber: `RX-${Date.now()}`, productId: b.product_id,
        patientId: b.patient_id || null, patientName: b.patient_name, patientPhone: b.patient_phone || null,
        prescriberName: b.prescriber_name, prescriberReg: b.prescriber_reg || null, sig: b.sig || null,
        quantity: b.quantity, refillsAuthorized: b.refills_authorized, daw: b.daw,
        daysSupply: b.days_supply || null, validUntil, allergies: b.allergies,
        createdById: req.user.id,
      },
    });
    res.status(201).json({ ...rx, refills_remaining: 1 + rx.refillsAuthorized });
  } catch (err) { next(err); }
});

// Multi-drug prescription (a real script). Creates one group header plus an
// independent Prescription line per drug — each keeps its own quantity, refills,
// SIG, DAW and dispensing, and inherits the shared patient/prescriber/allergies/
// validity. Dispense each line via the existing /prescriptions/:id/dispense.
router.post('/prescriptions/group', auth, requireRole('owner', 'manager'), validate(z.object({
  patient_id:      uuid.optional().nullable(),
  patient_name:    z.string().trim().min(1).max(255),
  patient_phone:   z.string().max(50).optional().nullable(),
  prescriber_name: z.string().trim().min(1).max(255),
  prescriber_reg:  z.string().max(100).optional().nullable(),
  allergies:       z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  valid_days:      z.coerce.number().int().positive().max(730).default(180),
  notes:           z.string().max(1000).optional().nullable(),
  items: z.array(z.object({
    product_id:         uuid,
    quantity:           z.coerce.number().int().positive(),
    sig:                z.string().max(500).optional().nullable(),
    daw:                z.boolean().default(false),
    days_supply:        z.coerce.number().int().positive().max(365).optional().nullable(),
    refills_authorized: z.coerce.number().int().min(0).max(12).default(0),
  })).min(1).max(25),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const b = req.body;
    const productIds = [...new Set(b.items.map(i => i.product_id))];
    const found = await prisma.product.findMany({ where: { id: { in: productIds }, businessId }, select: { id: true } });
    if (found.length !== productIds.length) return res.status(404).json({ error: 'One or more drugs not found.' });

    const validUntil = new Date(Date.now() + b.valid_days * 86400000);
    const stamp = Date.now();
    const out = await prisma.$transaction(async (tx) => {
      const group = await tx.prescriptionGroup.create({
        data: {
          businessId, groupNumber: `RXG-${stamp}`,
          patientId: b.patient_id || null, patientName: b.patient_name, patientPhone: b.patient_phone || null,
          prescriberName: b.prescriber_name, prescriberReg: b.prescriber_reg || null,
          allergies: b.allergies, notes: b.notes || null, createdById: req.user.id,
        },
      });
      const items = [];
      for (let i = 0; i < b.items.length; i++) {
        const it = b.items[i];
        const rx = await tx.prescription.create({
          data: {
            businessId, groupId: group.id, rxNumber: `RX-${stamp}-${i + 1}`, productId: it.product_id,
            patientId: b.patient_id || null, patientName: b.patient_name, patientPhone: b.patient_phone || null,
            prescriberName: b.prescriber_name, prescriberReg: b.prescriber_reg || null, sig: it.sig || null,
            quantity: it.quantity, refillsAuthorized: it.refills_authorized, daw: it.daw,
            daysSupply: it.days_supply || null, validUntil, allergies: b.allergies, createdById: req.user.id,
          },
        });
        items.push({ ...rx, refills_remaining: 1 + rx.refillsAuthorized });
      }
      return { group, items };
    });
    res.status(201).json({ ...out.group, items: out.items });
  } catch (err) { next(err); }
});

router.get('/prescriptions/group/:id', auth, async (req, res, next) => {
  try {
    const group = await prisma.prescriptionGroup.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: {
        items: {
          include: { product: { select: { name: true, genericName: true, controlledSchedule: true } }, _count: { select: { dispenses: true } } },
          orderBy: { rxNumber: 'asc' },
        },
      },
    });
    if (!group) return res.status(404).json({ error: 'Prescription group not found.' });
    res.json({
      ...group,
      items: group.items.map(rx => ({ ...rx, refills_remaining: Math.max(0, 1 + rx.refillsAuthorized - rx.refillsUsed) })),
    });
  } catch (err) { next(err); }
});

router.get('/prescriptions', auth, async (req, res, next) => {
  try {
    const list = await prisma.prescription.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: req.query.status }), ...(req.query.patient_id && { patientId: req.query.patient_id }) },
      include: { product: { select: { name: true, genericName: true, controlledSchedule: true } }, _count: { select: { dispenses: true } } },
      orderBy: { issuedAt: 'desc' }, take: 200,
    });
    res.json({ prescriptions: list });
  } catch (err) { next(err); }
});

router.get('/prescriptions/:id', auth, async (req, res, next) => {
  try {
    const rx = await prisma.prescription.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { product: { select: { name: true, genericName: true, strength: true, controlledSchedule: true } }, dispenses: { orderBy: { dispensedAt: 'desc' } } },
    });
    if (!rx) return res.status(404).json({ error: 'Prescription not found.' });
    res.json({ ...rx, refills_remaining: Math.max(0, 1 + rx.refillsAuthorized - rx.refillsUsed) });
  } catch (err) { next(err); }
});

// Dispensing label — the patient-facing label a pharmacist must affix. Returns a
// structured payload plus a ready-to-print `label_text` (thermal/sticker).
router.get('/prescriptions/:id/label', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const [rx, business] = await Promise.all([
      prisma.prescription.findFirst({
        where: { id: req.params.id, businessId },
        include: { product: { select: { name: true, genericName: true, strength: true, formulation: true, controlledSchedule: true } } },
      }),
      prisma.business.findUnique({ where: { id: businessId }, select: { name: true, address: true, phone: true } }),
    ]);
    if (!rx) return res.status(404).json({ error: 'Prescription not found.' });

    const warnings = ['Keep out of reach of children.'];
    if (rx.product.controlledSchedule) warnings.unshift(`CONTROLLED (${rx.product.controlledSchedule}) — dispense per regulation.`);
    if (rx.product.isPrescriptionDrug !== false) warnings.push('Use only as directed by your prescriber.');

    const dispensedOn = new Date().toISOString().slice(0, 10);
    const label = {
      pharmacy: { name: business?.name || 'Pharmacy', address: business?.address || '', phone: business?.phone || '' },
      rx_number: rx.rxNumber, dispensed_on: dispensedOn,
      patient: { name: rx.patientName, phone: rx.patientPhone || '' },
      drug: { name: rx.product.name, generic: rx.product.genericName || '', strength: rx.product.strength || '', form: rx.product.formulation || '' },
      directions: rx.sig || 'Take as directed.',
      quantity: rx.quantity,
      refills_remaining: Math.max(0, 1 + rx.refillsAuthorized - rx.refillsUsed),
      prescriber: { name: rx.prescriberName, reg: rx.prescriberReg || '' },
      controlled: rx.product.controlledSchedule || null,
      warnings,
    };
    const W = 40, line = '-'.repeat(W);
    label.label_text = [
      (business?.name || 'Pharmacy').toUpperCase(), business?.address || '', business?.phone || '', line,
      `Rx: ${rx.rxNumber}    ${dispensedOn}`,
      `Patient: ${rx.patientName}`, line,
      `${rx.product.name} ${rx.product.strength || ''}`.trim(),
      rx.product.genericName ? `(${rx.product.genericName})` : '',
      `Qty: ${rx.quantity}`,
      `Directions: ${rx.sig || 'Take as directed.'}`, line,
      `Prescriber: ${rx.prescriberName}`,
      ...warnings.map(w => `! ${w}`),
    ].filter(Boolean).join('\n');

    res.json(label);
  } catch (err) { next(err); }
});

// Dispense against a prescription: enforces refill limits, requires a second-
// person verification for controlled substances, and deducts stock.
router.post('/prescriptions/:id/dispense', auth, requireRole('owner', 'manager'), validate(z.object({
  location_id: uuid,
  quantity:    z.coerce.number().int().positive().optional(),
  verified_by: uuid.optional().nullable(),
  override:    z.boolean().optional(), // override a soft clinical block (documented decision)
  substitute_product_id: uuid.optional().nullable(), // dispense a generic equivalent (blocked if DAW)
})), async (req, res, next) => {
  try {
    const out = await prisma.$transaction(async (tx) => {
      const rx = await tx.prescription.findFirst({
        where: { id: req.params.id, businessId: req.user.business_id },
        include: { product: { select: { id: true, name: true, genericName: true, controlledSchedule: true } } },
      });
      if (!rx) return { code: 404, error: 'Prescription not found.' };
      if (rx.status !== 'active') return { code: 400, error: 'Prescription is not active.' };

      // Expired prescriptions are invalid — a hard stop, not overridable.
      if (rx.validUntil && new Date() > new Date(rx.validUntil)) {
        return { code: 400, error: `Prescription expired on ${new Date(rx.validUntil).toISOString().slice(0, 10)}. A new prescription is required.` };
      }

      const allowed = 1 + rx.refillsAuthorized; // original fill + authorised refills
      if (rx.refillsUsed >= allowed) return { code: 400, error: 'No refills remaining on this prescription.' };

      // Early-refill guard: a fill should last daysSupply; block refilling before
      // ~80% of that supply has elapsed (a documented override is allowed, e.g.
      // travel). Skipped when no daysSupply is recorded.
      if (rx.daysSupply && rx.refillsUsed > 0 && !req.body.override) {
        const last = await tx.dispenseRecord.findFirst({ where: { prescriptionId: rx.id }, orderBy: { dispensedAt: 'desc' }, select: { dispensedAt: true } });
        if (last) {
          const earliest = new Date(new Date(last.dispensedAt).getTime() + Math.floor(rx.daysSupply * 0.8) * 86400000);
          if (new Date() < earliest) {
            return { code: 400, error: `Too soon to refill — next fill from ${earliest.toISOString().slice(0, 10)} (${rx.daysSupply}-day supply). Pass override=true for an early refill.` };
          }
        }
      }

      // Generic substitution: dispense a different product than written. Blocked
      // when the prescriber marked the Rx dispense-as-written (DAW).
      let dispensedProduct = rx.product;
      if (req.body.substitute_product_id && req.body.substitute_product_id !== rx.product.id) {
        if (rx.daw) return { code: 400, error: 'Prescription is marked dispense-as-written (DAW); generic substitution is not permitted.' };
        const sub = await tx.product.findFirst({ where: { id: req.body.substitute_product_id, businessId: req.user.business_id }, select: { id: true, name: true, genericName: true, controlledSchedule: true } });
        if (!sub) return { code: 404, error: 'Substitute drug not found.' };
        dispensedProduct = sub;
      }

      // Allergy check: block if the dispensed drug matches a recorded patient
      // allergy (name or generic), unless overridden with a documented decision.
      const drugTerms = [dispensedProduct.name, dispensedProduct.genericName].filter(Boolean).map(s => s.toLowerCase());
      const allergyHit = (rx.allergies || []).find(a => {
        const al = a.toLowerCase();
        return drugTerms.some(t => t.includes(al) || al.includes(t));
      });
      if (allergyHit && !req.body.override) {
        return { code: 409, error: `Patient has a recorded allergy to "${allergyHit}" — dispensing ${dispensedProduct.name} is blocked. Pass override=true to proceed on a documented clinical decision.`, allergy: allergyHit };
      }

      // Clinical safety: check this drug against the patient's other active meds.
      // A contraindication blocks the dispense unless explicitly overridden.
      const otherMeds = await patientDrugNames(req.user.business_id, { patientId: rx.patientId, patientName: rx.patientName, excludeRxId: rx.id });
      const interWarnings = await interactions.check(req.user.business_id, [dispensedProduct.genericName || dispensedProduct.name, ...otherMeds]);
      if (interactions.hasContraindication(interWarnings) && !req.body.override) {
        return { code: 409, error: 'Contraindicated drug interaction — dispensing blocked. Resolve, or pass override=true to proceed on a documented clinical decision.', interactions: interWarnings };
      }

      // Controlled substances require a different second user to verify (check the
      // drug actually dispensed, so a controlled substitute is covered too).
      if (dispensedProduct.controlledSchedule) {
        if (!req.body.verified_by) return { code: 400, error: `Controlled substance (${dispensedProduct.controlledSchedule}) requires a second-person verification (verified_by).` };
        if (req.body.verified_by === req.user.id) return { code: 400, error: 'The verifier must be a different user than the dispenser.' };
        const verifier = await tx.user.findFirst({ where: { id: req.body.verified_by, businessId: req.user.business_id, isActive: true }, select: { id: true } });
        if (!verifier) return { code: 400, error: 'Verifier not found.' };
      }

      const qty = req.body.quantity || rx.quantity;
      const rows = await tx.$queryRaw`SELECT quantity FROM stock_levels WHERE product_id = ${dispensedProduct.id}::uuid AND location_id = ${req.body.location_id}::uuid FOR UPDATE`;
      const have = rows[0]?.quantity ?? 0;
      if (have < qty) return { code: 400, error: `Insufficient stock to dispense ${dispensedProduct.name}: need ${qty}, have ${have}.` };
      const newQty = have - qty;
      await tx.$executeRaw`UPDATE stock_levels SET quantity = ${newQty}, updated_at = NOW() WHERE product_id = ${dispensedProduct.id}::uuid AND location_id = ${req.body.location_id}::uuid`;
      await tx.stockMovement.create({ data: { businessId: req.user.business_id, productId: dispensedProduct.id, locationId: req.body.location_id, type: 'out', quantity: -qty, balanceAfter: newQty, referenceType: 'dispense', referenceId: rx.id, createdById: req.user.id } });

      const dispense = await tx.dispenseRecord.create({ data: { businessId: req.user.business_id, prescriptionId: rx.id, productId: dispensedProduct.id, quantity: qty, dispensedById: req.user.id, verifiedById: req.body.verified_by || null } });
      const newUsed = rx.refillsUsed + 1;
      await tx.prescription.update({ where: { id: rx.id }, data: { refillsUsed: newUsed, status: newUsed >= allowed ? 'completed' : 'active' } });

      return { dispense, substituted: dispensedProduct.id !== rx.product.id, refills_remaining: Math.max(0, allowed - newUsed), interactions: interWarnings };
    });
    if (out.error) return res.status(out.code).json({ error: out.error, ...(out.interactions && { interactions: out.interactions }), ...(out.allergy && { allergy: out.allergy }) });
    res.status(201).json({ message: 'Dispensed.', dispense: out.dispense, substituted: out.substituted, refills_remaining: out.refills_remaining, interactions: out.interactions || [] });
  } catch (err) { next(err); }
});

// Controlled-substance dispensing register (audit trail for scheduled drugs).
router.get('/controlled-register', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const records = await prisma.dispenseRecord.findMany({
      where: { businessId: req.user.business_id, product: { controlledSchedule: { not: null } } },
      include: { product: { select: { name: true, controlledSchedule: true } }, prescription: { select: { rxNumber: true, patientName: true, prescriberName: true } } },
      orderBy: { dispensedAt: 'desc' }, take: 500,
    });
    res.json({ register: records.map(r => ({
      dispensed_at: r.dispensedAt, drug: r.product.name, schedule: r.product.controlledSchedule,
      quantity: r.quantity, rx_number: r.prescription.rxNumber, patient: r.prescription.patientName,
      prescriber: r.prescription.prescriberName, dispensed_by: r.dispensedById, verified_by: r.verifiedById,
    })) });
  } catch (err) { next(err); }
});

// ── PHARMACY SETTINGS ─────────────────────────────────────────────
// Toggle Rx-only enforcement at the till. Off by default so general retail is
// unaffected; on, a prescription-only drug can't be sold at POS without a valid
// prescription (enforced in the sales path).
router.get('/settings', auth, async (req, res, next) => {
  try {
    const b = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { enforceRxOnSale: true } });
    res.json({ enforce_rx_on_sale: !!b?.enforceRxOnSale });
  } catch (err) { next(err); }
});

router.put('/settings', auth, requireRole('owner', 'manager'), validate(z.object({
  enforce_rx_on_sale: z.boolean(),
})), async (req, res, next) => {
  try {
    const b = await prisma.business.update({
      where: { id: req.user.business_id },
      data:  { enforceRxOnSale: req.body.enforce_rx_on_sale },
      select: { enforceRxOnSale: true },
    });
    res.json({ enforce_rx_on_sale: b.enforceRxOnSale });
  } catch (err) { next(err); }
});

module.exports = router;
