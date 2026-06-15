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
  isPrescriptionDrug: z.boolean().optional(),
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

module.exports = router;
