// Product Sell report: sold line items in five views — detailed, detailed with
// purchase source, grouped by product/date, by category and by brand — sharing
// one filter set (product search, customer, customer group, location, category,
// brand, date + time range). Quantities and money are net of refunds.
const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, PL_DATE_RE, plNum, plRound, plParseDay } = require('./_shared');

const router = express.Router();

const VIEWS = ['detailed', 'detailed_purchase', 'grouped_date', 'by_category', 'by_brand'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get('/product-sell', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const view = req.query.view || 'detailed';
    if (!VIEWS.includes(view)) {
      return res.status(400).json({ title: `view must be one of: ${VIEWS.join(', ')}.`, status: 400 });
    }
    const bset = await getBusinessSettings(bizId);

    // Date + time range → timestamp bounds. Time defaults to the whole day.
    const { from, to, time_from: tf, time_to: tt } = req.query;
    if ((from && !PL_DATE_RE.test(from)) || (to && !PL_DATE_RE.test(to)) ||
        (tf && !HHMM.test(tf)) || (tt && !HHMM.test(tt))) {
      return res.status(400).json({ title: 'Bad date or time range.', status: 400 });
    }
    const fromDay = plParseDay(from) || new Date(bset.start_date || '2000-01-01');
    const toDay = plParseDay(to);
    const fromDate = new Date(fromDay);
    if (tf) { const [h, m] = tf.split(':'); fromDate.setHours(+h, +m, 0, 0); }
    let toEnd;
    if (toDay) {
      toEnd = new Date(toDay);
      if (tt) { const [h, m] = tt.split(':'); toEnd.setHours(+h, +m, 59, 999); toEnd = new Date(toEnd.getTime() + 1); }
      else toEnd = new Date(toDay.getTime() + 86400000);
    } else toEnd = new Date('2099-12-31');

    // Optional id filters.
    const loc = req.query.location_id || null;
    const customer = req.query.customer_id || null;
    const group = req.query.customer_group_id || null;
    const category = req.query.category_id || null;
    const brand = req.query.brand_id || null;
    for (const [k, v] of [['location_id', loc], ['customer_id', customer], ['customer_group_id', group], ['category_id', category], ['brand_id', brand]]) {
      if (v && !(typeof v === 'string' && PL_UUID_RE.test(v))) {
        return res.status(400).json({ title: `${k} must be a UUID.`, status: 400 });
      }
    }
    const search = typeof req.query.search === 'string' && req.query.search.trim() ? `%${req.query.search.trim()}%` : null;

    // Shared predicates for the sales × items join. `c` (categories) and `b`
    // (brands) are joined by every view, so the category/brand filters work
    // everywhere.
    const where = Prisma.sql`
      s.business_id = ${bizId}::uuid
      AND s.status IN ('completed', 'refunded', 'partially_refunded')
      AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
      AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      AND (${customer}::uuid IS NULL OR s.customer_id = ${customer}::uuid)
      AND (${group}::uuid IS NULL OR cu.customer_group_id = ${group}::uuid)
      AND (${category}::uuid IS NULL OR p.category_id = ${category}::uuid)
      AND (${brand}::uuid IS NULL OR p.brand_id = ${brand}::uuid)
      AND (${search}::text IS NULL OR p.name ILIKE ${search} OR p.sku ILIKE ${search} OR p.barcode ILIKE ${search})`;

    // Refunded quantity/amount per sale item, within the same window, so every
    // view reports net figures.
    const rf = Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT SUM(ri.quantity)::int AS qty, SUM(ri.total_price) AS amount
        FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
        WHERE ri.sale_item_id = si.id AND r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
      ) rf ON TRUE`;
    const joins = Prisma.sql`
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN customers cu ON cu.id = s.customer_id
      ${rf}`;

    let rows, totals;

    if (view === 'detailed') {
      const raw = await prisma.$queryRaw(Prisma.sql`
        SELECT si.id, p.name AS product, p.sku, p.unit_of_measure AS unit,
               cu.name AS customer, cu.phone AS contact_number, cu.email,
               COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS invoice, s.created_at AS date,
               s.payment_method,
               (si.quantity - COALESCE(rf.qty, 0))::int AS qty,
               si.unit_price, si.discount, si.tax_amount, si.quantity AS gross_qty,
               tr.name AS tax_name
        ${joins}
        LEFT JOIN tax_rates tr ON tr.id = si.tax_rate_id
        WHERE ${where}
        ORDER BY s.created_at DESC
        LIMIT 5000`);
      rows = raw.map(r => {
        const gross = Number(r.gross_qty) || 0;
        const perUnitTax = gross > 0 ? plRound(plNum(r.tax_amount) / gross) : 0;
        const qty = Number(r.qty) || 0;
        const lineTotal = plRound(qty * (plNum(r.unit_price) + perUnitTax));
        return {
          id: r.id, product: r.product, sku: r.sku || '',
          customer: r.customer || 'Walk-In Customer',
          contact_id: r.customer ? 'CUS-' + String(r.id).slice(0, 6).toUpperCase() : '',
          contact_number: r.contact_number || '', email: r.email || '',
          invoice: r.invoice, date: r.date,
          quantity: qty, unit: r.unit || 'unit',
          unit_price: plNum(r.unit_price),
          discount: plNum(r.discount),
          tax: perUnitTax, tax_name: r.tax_name || '',
          price_inc_tax: plRound(plNum(r.unit_price) + perUnitTax),
          total: lineTotal,
          payment_method: r.payment_method || '',
        };
      });
      totals = {
        quantity: rows.reduce((s, r) => s + r.quantity, 0),
        // Line-level tax (per-unit × net qty) — a sum of the per-unit cells
        // would understate it for any qty > 1.
        tax: plRound(rows.reduce((s, r) => s + r.tax * r.quantity, 0)),
        total: plRound(rows.reduce((s, r) => s + r.total, 0)),
      };

    } else if (view === 'detailed_purchase') {
      const raw = await prisma.$queryRaw(Prisma.sql`
        SELECT si.id, p.name AS product, p.sku,
               cu.name AS customer, cu.phone AS contact_number, cu.email,
               COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS invoice, s.created_at AS date,
               p.unit_of_measure AS unit,
               (si.quantity - COALESCE(rf.qty, 0))::int AS qty,
               pur.po_number AS purchase_ref, pur.supplier AS supplier
        ${joins}
        LEFT JOIN LATERAL (
          SELECT po.po_number, sup.name AS supplier
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.po_id
          LEFT JOIN suppliers sup ON sup.id = po.supplier_id
          WHERE poi.product_id = si.product_id AND po.business_id = ${bizId}::uuid
            AND po.status IN ('partial', 'received')
          ORDER BY po.order_date DESC LIMIT 1
        ) pur ON TRUE
        WHERE ${where}
        ORDER BY s.created_at DESC
        LIMIT 5000`);
      rows = raw.map(r => ({
        id: r.id, product: r.product, sku: r.sku || '',
        customer: r.customer || 'Walk-In Customer',
        contact_number: r.contact_number || '', email: r.email || '',
        invoice: r.invoice, date: r.date,
        purchase_ref: r.purchase_ref || '', supplier: r.supplier || '',
        quantity: Number(r.qty) || 0, unit: r.unit || 'unit',
      }));
      totals = { quantity: rows.reduce((s, r) => s + r.quantity, 0) };

    } else {
      // Aggregated views. Current stock is the live on-hand (independent of the
      // date filter); units sold and total are net within the window.
      const stockExpr = Prisma.sql`
        COALESCE((SELECT SUM(sl.quantity) FROM stock_levels sl WHERE sl.product_id = p.id
          ${loc ? Prisma.sql`AND sl.location_id = ${loc}::uuid` : Prisma.empty}), 0)`;
      let selectHead, groupBy, orderBy, mapRow, stockScope;
      if (view === 'grouped_date') {
        selectHead = Prisma.sql`p.id AS gid, p.name AS label, p.sku, DATE(s.created_at) AS day, ${stockExpr}::float AS current_stock`;
        groupBy = Prisma.sql`p.id, p.name, p.sku, DATE(s.created_at)`;
        orderBy = Prisma.sql`p.name ASC`;
        mapRow = r => ({ label: r.label, sku: r.sku || '', date: r.day, current_stock: plNum(r.current_stock), units_sold: Number(r.units) || 0, total: plRound(plNum(r.total)) });
      } else if (view === 'by_category') {
        stockScope = 'category';
        selectHead = Prisma.sql`COALESCE(c.id::text, 'none') AS gid, COALESCE(c.name, 'Uncategorized') AS label`;
        groupBy = Prisma.sql`c.id, c.name`;
        orderBy = Prisma.sql`label ASC`;
        mapRow = r => ({ label: r.label, current_stock: plNum(r.current_stock), units_sold: Number(r.units) || 0, total: plRound(plNum(r.total)) });
      } else {
        stockScope = 'brand';
        selectHead = Prisma.sql`COALESCE(b.id::text, 'none') AS gid, COALESCE(b.name, 'No brand') AS label`;
        groupBy = Prisma.sql`b.id, b.name`;
        orderBy = Prisma.sql`label ASC`;
        mapRow = r => ({ label: r.label, current_stock: plNum(r.current_stock), units_sold: Number(r.units) || 0, total: plRound(plNum(r.total)) });
      }

      // For category/brand, current stock sums the live on-hand of every product
      // in the group (not only sold ones), matching the reference.
      const stockAgg = stockScope
        ? Prisma.sql`, COALESCE((
            SELECT SUM(sl.quantity) FROM stock_levels sl JOIN products p2 ON p2.id = sl.product_id
            WHERE p2.business_id = ${bizId}::uuid
              AND ${stockScope === 'category' ? Prisma.sql`p2.category_id IS NOT DISTINCT FROM c.id` : Prisma.sql`p2.brand_id IS NOT DISTINCT FROM b.id`}
              ${loc ? Prisma.sql`AND sl.location_id = ${loc}::uuid` : Prisma.empty}
          ), 0)::float AS current_stock`
        : Prisma.empty;

      const raw = await prisma.$queryRaw(Prisma.sql`
        SELECT ${selectHead}${stockAgg},
               SUM(si.quantity - COALESCE(rf.qty, 0))::float AS units,
               SUM(si.total_price - COALESCE(rf.amount, 0))::float AS total
        ${joins}
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE ${where}
        GROUP BY ${groupBy}
        ORDER BY ${orderBy}
        LIMIT 5000`);
      rows = raw.map(mapRow);
      // grouped_date repeats a product across its sold-days, so total current
      // stock counts each product once; the group views already aggregate once.
      let stockTotal;
      if (view === 'grouped_date') {
        const seen = new Map();
        for (const r of rows) { const k = `${r.label}|${r.sku}`; if (!seen.has(k)) seen.set(k, r.current_stock); }
        stockTotal = plRound([...seen.values()].reduce((s, v) => s + v, 0));
      } else {
        stockTotal = plRound(rows.reduce((s, r) => s + r.current_stock, 0));
      }
      totals = {
        current_stock: stockTotal,
        units_sold: plRound(rows.reduce((s, r) => s + r.units_sold, 0)),
        total: plRound(rows.reduce((s, r) => s + r.total, 0)),
      };
    }

    res.json({
      view,
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      rows, totals,
      limited: rows.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
