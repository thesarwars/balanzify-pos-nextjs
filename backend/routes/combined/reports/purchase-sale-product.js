// Purchase & Sale Product: what was bought against what was sold, grouped by
// category, brand or supplier. Purchases count once goods arrived
// (partial/received) at the document's ordered figures — the same basis as the
// Product Purchase report, so the two reconcile — converted to base units so
// the bought and sold quantities are comparable. Sales are net of refunds,
// counted in the period the refund was issued.
//
// Grouping by supplier is only well-defined for purchases (a PO has a
// supplier); a SALE has none. Each product's sales are therefore attributed to
// exactly one supplier — its preferred supplier link, else the supplier of its
// most recent delivered purchase, else any other link — so no sale is counted
// twice across suppliers.
const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

const GROUPS = ['category', 'brand', 'supplier'];

router.get('/purchase-sale-product', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const group = req.query.group || 'category';
    if (!GROUPS.includes(group)) {
      return res.status(400).json({ title: `group must be one of: ${GROUPS.join(', ')}.`, status: 400 });
    }
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    // The group's own optional id filter (Category / Brand / Supplier select).
    const filterId = req.query.category_id || req.query.brand_id || req.query.supplier_id || null;
    if (filterId && !(typeof filterId === 'string' && PL_UUID_RE.test(filterId))) {
      return res.status(400).json({ title: 'The filter id must be a UUID.', status: 400 });
    }

    // One product's attributed supplier. Priority: a preferred link (0), then
    // the supplier of its most recent DELIVERED purchase (1), then any other
    // link (2) as a last resort. `q.id` is the final tie-break so the answer is
    // stable across runs — without it two links at the same rank would let
    // Postgres return either, moving a product's sales between suppliers on
    // successive refreshes. Only joined for the supplier grouping.
    const saleSupplier = Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT q.id, q.name FROM (
          SELECT sp.supplier_id AS id, s2.name AS name,
                 (CASE WHEN sp.is_preferred THEN 0 ELSE 2 END) AS pri, NULL::date AS d
          FROM supplier_products sp JOIN suppliers s2 ON s2.id = sp.supplier_id
          WHERE sp.product_id = p.id AND s2.business_id = ${bizId}::uuid
          UNION ALL
          SELECT po2.supplier_id, sup2.name, 1, po2.order_date
          FROM purchase_order_items poi2
          JOIN purchase_orders po2 ON po2.id = poi2.po_id
          JOIN suppliers sup2 ON sup2.id = po2.supplier_id
          WHERE poi2.product_id = p.id AND po2.business_id = ${bizId}::uuid
            AND po2.status IN ('partial', 'received')
        ) q
        ORDER BY q.pri, q.d DESC NULLS LAST, q.id
        LIMIT 1
      ) sup ON TRUE`;

    // Per-side group key + label, and the side's own filter predicate.
    let purKey, purLabel, purFilter, salKey, salLabel, salFilter, salJoin;
    if (group === 'category') {
      purKey = salKey = Prisma.sql`COALESCE(p.category_id::text, 'none')`;
      purLabel = salLabel = Prisma.sql`COALESCE(c.name, 'Uncategorized')`;
      purFilter = salFilter = filterId
        ? Prisma.sql`AND (p.category_id = ${filterId}::uuid OR c.parent_id = ${filterId}::uuid)`
        : Prisma.empty;
      salJoin = Prisma.empty;
    } else if (group === 'brand') {
      purKey = salKey = Prisma.sql`COALESCE(p.brand_id::text, 'none')`;
      purLabel = salLabel = Prisma.sql`COALESCE(b.name, 'No brand')`;
      purFilter = salFilter = filterId ? Prisma.sql`AND p.brand_id = ${filterId}::uuid` : Prisma.empty;
      salJoin = Prisma.empty;
    } else {
      purKey = Prisma.sql`COALESCE(po.supplier_id::text, 'none')`;
      purLabel = Prisma.sql`COALESCE(psup.name, 'No supplier')`;
      purFilter = filterId ? Prisma.sql`AND po.supplier_id = ${filterId}::uuid` : Prisma.empty;
      salKey = Prisma.sql`COALESCE(sup.id::text, 'none')`;
      salLabel = Prisma.sql`COALESCE(sup.name, 'No supplier')`;
      salFilter = filterId ? Prisma.sql`AND sup.id = ${filterId}::uuid` : Prisma.empty;
      salJoin = saleSupplier;
    }

    // A sale line's net-of-discount value per sold unit — refund_items are
    // priced at the ORIGINAL unit price (gross of the line discount), so
    // subtracting their total_price would over-credit a discounted line and can
    // drive the value negative. Refunded units are valued at the line's own
    // effective price instead.
    const perUnit = Prisma.sql`(si.total_price / NULLIF(si.quantity, 0))`;

    const rows = await prisma.$queryRaw(Prisma.sql`
      WITH pur AS (
        SELECT ${purKey} AS gid, ${purLabel} AS label,
               -- Purchase units → base units, so this is comparable with sold qty.
               SUM(poi.ordered_qty * COALESCE(CASE WHEN u.base_unit_id IS NOT NULL THEN u.base_multiplier END, 1))::float AS qty,
               SUM(poi.total_price)::float AS value
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        JOIN products p ON p.id = poi.product_id
        LEFT JOIN units u ON u.id = poi.unit_id
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN suppliers psup ON psup.id = po.supplier_id
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
          ${purFilter}
        GROUP BY 1, 2
      ),
      sal AS (
        SELECT gid, label, SUM(qty)::float AS qty, SUM(value)::float AS value FROM (
          -- Sales made in the window, less any refund raised against them here.
          SELECT ${salKey} AS gid, ${salLabel} AS label,
                 (si.quantity - COALESCE(rf.qty, 0))::float AS qty,
                 (si.total_price - COALESCE(rf.qty, 0) * ${perUnit})::float AS value
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          JOIN products p ON p.id = si.product_id
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN brands b ON b.id = p.brand_id
          ${salJoin}
          LEFT JOIN LATERAL (
            SELECT SUM(ri.quantity)::int AS qty
            FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
            WHERE ri.sale_item_id = si.id AND r.business_id = ${bizId}::uuid
              AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          ) rf ON TRUE
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            ${salFilter}
          UNION ALL
          -- Refunds raised in the window against a sale from OUTSIDE it —
          -- without this they'd be netted in no period at all.
          SELECT ${salKey} AS gid, ${salLabel} AS label,
                 (-ri.quantity)::float AS qty,
                 (-(ri.quantity * ${perUnit}))::float AS value
          FROM refund_items ri
          JOIN refunds r ON r.id = ri.refund_id
          JOIN sale_items si ON si.id = ri.sale_item_id
          JOIN sales s ON s.id = r.sale_id
          JOIN products p ON p.id = si.product_id
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN brands b ON b.id = p.brand_id
          ${salJoin}
          WHERE r.business_id = ${bizId}::uuid
            AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
            AND NOT (s.created_at >= ${fromDate} AND s.created_at < ${toEnd})
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            ${salFilter}
        ) u2
        GROUP BY 1, 2
      )
      SELECT COALESCE(pur.label, sal.label) AS label,
             COALESCE(pur.qty, 0)::float   AS purchase_qty,
             COALESCE(pur.value, 0)::float AS purchase_value,
             COALESCE(sal.qty, 0)::float   AS sold_qty,
             COALESCE(sal.value, 0)::float AS sale_value
      FROM pur FULL OUTER JOIN sal ON sal.gid = pur.gid
      ORDER BY 1
      LIMIT 5000
    `);

    const out = rows.map(r => {
      const purchase = plRound(plNum(r.purchase_value));
      const sale = plRound(plNum(r.sale_value));
      return {
        label: r.label,
        purchase_quantity: plRound(plNum(r.purchase_qty)),
        purchase_value: purchase,
        sold_quantity: plRound(plNum(r.sold_qty)),
        sale_value: sale,
        difference: plRound(sale - purchase),
      };
    });

    res.json({
      group,
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      rows: out,
      totals: {
        purchase_quantity: plRound(out.reduce((s, r) => s + r.purchase_quantity, 0)),
        purchase_value: plRound(out.reduce((s, r) => s + r.purchase_value, 0)),
        sold_quantity: plRound(out.reduce((s, r) => s + r.sold_quantity, 0)),
        sale_value: plRound(out.reduce((s, r) => s + r.sale_value, 0)),
        difference: plRound(out.reduce((s, r) => s + r.difference, 0)),
      },
      limited: rows.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
