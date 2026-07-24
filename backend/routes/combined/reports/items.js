// Items report: one row per sold line item — the sell side in full, the line's
// actual consumed (FIFO) cost as the purchase price, and an indicative purchase
// source (latest received PO for that product). The sold unit's exact source
// layer is not recorded per line, so the purchase date/ref/supplier/lot are the
// product's most recent purchase, shown for context rather than as an exact lot
// trace.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

router.get('/items', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const rows = await prisma.$queryRaw`
      SELECT si.id,
             p.name AS product, p.sku, p.description,
             s.created_at AS sell_date,
             COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS sale_ref,
             cu.name AS customer,
             l.name AS location,
             si.quantity AS sell_qty,
             si.unit_price AS selling_price,
             si.total_price AS subtotal,
             si.cost_price AS purchase_price,
             pur.order_date AS purchase_date,
             pur.po_number AS purchase_ref,
             pur.batch_number AS lot_number,
             pur.supplier AS supplier
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN customers cu ON cu.id = s.customer_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN LATERAL (
        SELECT po.po_number, po.order_date, poi.batch_number, sup.name AS supplier
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        LEFT JOIN suppliers sup ON sup.id = po.supplier_id
        WHERE poi.product_id = si.product_id
          AND po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
        ORDER BY po.order_date DESC
        LIMIT 1
      ) pur ON TRUE
      WHERE s.business_id = ${bizId}::uuid
        AND s.status IN ('completed', 'refunded', 'partially_refunded')
        AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
        AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      ORDER BY s.created_at DESC
      LIMIT 5000
    `;

    const out = rows.map(r => {
      const qty = Number(r.sell_qty) || 0;
      const cost = plNum(r.purchase_price);
      return {
        id: r.id,
        product: r.product, sku: r.sku || '', description: r.description || '',
        purchase_date: r.purchase_date || null,
        purchase_ref: r.purchase_ref || '',
        lot_number: r.lot_number || '',
        supplier: r.supplier || '',
        // Line purchase value at the actual consumed cost.
        purchase_value: plRound(cost * qty),
        sell_date: r.sell_date,
        sale_ref: r.sale_ref,
        customer: r.customer || 'Walk-In Customer',
        location: r.location || '',
        sell_quantity: qty,
        selling_price: plNum(r.selling_price),
        subtotal: plRound(plNum(r.subtotal)),
      };
    });

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      rows: out,
      totals: {
        purchase_value: plRound(out.reduce((s, r) => s + r.purchase_value, 0)),
        sell_quantity: out.reduce((s, r) => s + r.sell_quantity, 0),
        subtotal: plRound(out.reduce((s, r) => s + r.subtotal, 0)),
      },
      limited: rows.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
