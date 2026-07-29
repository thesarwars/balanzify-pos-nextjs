// Trending Products: the top N products by units sold for a period, with
// location / category / sub-category / brand / unit / product-type filters.
const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_UUID_RE, plNum, plRange } = require('./_shared');

const router = express.Router();

router.get('/trending-products', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const category = req.query.category_id || null;
    const subCategory = req.query.sub_category_id || null;
    const brand = req.query.brand_id || null;
    for (const [k, v] of [['category_id', category], ['sub_category_id', subCategory], ['brand_id', brand]]) {
      if (v && !(typeof v === 'string' && PL_UUID_RE.test(v))) {
        return res.status(400).json({ title: `${k} must be a UUID.`, status: 400 });
      }
    }
    const unit = typeof req.query.unit === 'string' ? req.query.unit : null;
    const productType = req.query.product_type || 'all'; // all | single | variable
    if (!['all', 'single', 'variable'].includes(productType)) {
      return res.status(400).json({ title: 'product_type must be all, single or variable.', status: 400 });
    }
    let limit = parseInt(req.query.count, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 5;
    limit = Math.min(limit, 100);

    // sub-category is a child category; the top-level category filter includes
    // its children (products may be filed under a child).
    const catCond = subCategory
      ? Prisma.sql`AND p.category_id = ${subCategory}::uuid`
      : category
        ? Prisma.sql`AND (p.category_id = ${category}::uuid OR c.parent_id = ${category}::uuid)`
        : Prisma.empty;
    const typeCond = productType === 'variable'
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true)`
      : productType === 'single'
        ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true)`
        : Prisma.empty;

    // Net refunded units/revenue out, so returned goods don't inflate the
    // ranking — the same basis the profit-by breakdown uses.
    const rows = await prisma.$queryRaw(Prisma.sql`
      WITH rf AS (
        SELECT ri.sale_item_id,
               SUM(ri.quantity)::int AS qty,
               SUM(ri.total_price) AS amount
        FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
        WHERE r.business_id = ${bizId}::uuid AND ri.sale_item_id IS NOT NULL
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
        GROUP BY ri.sale_item_id
      )
      SELECT p.id, p.name, p.sku, p.unit_of_measure AS unit,
             SUM(si.quantity - COALESCE(rf.qty, 0))::int AS units_sold,
             -- Refunded units valued at the line's effective (post-discount) price.
             SUM(si.total_price - COALESCE(rf.qty, 0) * (si.total_price / NULLIF(si.quantity, 0)))::float AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN rf ON rf.sale_item_id = si.id
      WHERE s.business_id = ${bizId}::uuid
        AND s.status IN ('completed', 'refunded', 'partially_refunded')
        AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
        AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
        AND (${brand}::uuid IS NULL OR p.brand_id = ${brand}::uuid)
        AND (${unit}::text IS NULL OR p.unit_of_measure = ${unit})
        ${catCond}
        ${typeCond}
      GROUP BY p.id, p.name, p.sku, p.unit_of_measure
      HAVING SUM(si.quantity - COALESCE(rf.qty, 0)) > 0
      ORDER BY units_sold DESC
      LIMIT ${limit}
    `);

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      rows: rows.map(r => ({
        product_id: r.id, name: r.name, sku: r.sku, unit: r.unit,
        units_sold: Number(r.units_sold) || 0, revenue: plNum(r.revenue),
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
