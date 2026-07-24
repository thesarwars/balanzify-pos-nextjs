// Product Purchase report: one row per purchase line item — product, supplier,
// PO reference, date, quantity, unit purchase price and subtotal, plus the
// product's total adjusted units. Purchases count once goods arrived
// (partial/received), the same basis as the P&L and tax reports.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

router.get('/product-purchase', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const supplier = req.query.supplier_id || null;
    if (supplier && !(typeof supplier === 'string' && PL_UUID_RE.test(supplier))) {
      return res.status(400).json({ title: 'supplier_id must be a UUID.', status: 400 });
    }

    const [lines, adjusted] = await Promise.all([
      prisma.$queryRaw`
        SELECT poi.id,
               p.name AS product, p.sku, p.unit_of_measure AS unit, p.id AS product_id,
               s.name AS supplier_name, s.contact_person,
               po.po_number AS ref, po.order_date AS date,
               poi.ordered_qty AS quantity,
               poi.unit_price, poi.total_price AS subtotal
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        JOIN products p ON p.id = poi.product_id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
          AND (${supplier}::uuid IS NULL OR po.supplier_id = ${supplier}::uuid)
        ORDER BY po.order_date DESC, po.po_number DESC
        LIMIT 5000
      `,
      // Total adjusted units per product (net stock adjustments), attached to
      // each of that product's lines like the reference does.
      prisma.$queryRaw`
        SELECT product_id, SUM(ABS(quantity))::int AS adjusted
        FROM stock_movements
        WHERE business_id = ${bizId}::uuid AND type = 'adjustment'
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
        GROUP BY product_id
      `,
    ]);

    const adjBy = new Map(adjusted.map(a => [a.product_id, Number(a.adjusted) || 0]));

    const rows = lines.map(r => ({
      id: r.id,
      product: r.product,
      sku: r.sku || '',
      supplier: r.supplier_name ? (r.contact_person ? `${r.supplier_name}, ${r.contact_person}` : r.supplier_name) : '',
      ref: r.ref || '',
      date: r.date,
      quantity: Number(r.quantity) || 0,
      total_adjusted: adjBy.get(r.product_id) || 0,
      unit_purchase_price: plNum(r.unit_price),
      subtotal: plRound(plNum(r.subtotal)),
      unit: r.unit || 'unit',
    }));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, supplier_id: supplier,
      rows,
      totals: {
        quantity: rows.reduce((s, r) => s + r.quantity, 0),
        subtotal: plRound(rows.reduce((s, r) => s + r.subtotal, 0)),
      },
      limited: lines.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
