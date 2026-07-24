

const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange } = require('./_shared');

const router = express.Router();

// ── Tax report ───────────────────────────────────────────────────────────────
// Three registers — input tax (purchases), output tax (sales) and expense tax —
// each row carrying its per-tax-rate split, plus the overall
// output − input − expense position.
//
// Rate columns: every active tax rate gets one. A transaction taxed with a tax
// GROUP (e.g. GST@18% = CGST@10% + SGST@8%) is split across its component
// columns pro-rata by component rate, because that is what the group means for
// filing; the group's own column then stays empty for that row. Every row's
// columns therefore sum to its tax, with no double counting.
router.get('/tax', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const contact = req.query.contact_id || null;
    if (contact && !(typeof contact === 'string' && PL_UUID_RE.test(contact))) {
      return res.status(400).json({ title: 'contact_id must be a UUID.', status: 400 });
    }

    const [rates, subTaxes, purchases, sales, expenses, saleLineTax, sellReturns, purchaseReturns,
           purchaseAgg, salesAgg, expenseAgg] = await Promise.all([
      // ALL rates, not just active ones: tax booked against a rate that was
      // later deactivated still has to appear in its own column.
      prisma.taxRate.findMany({
        where: { businessId: bizId },
        select: { id: true, name: true, rate: true, isTaxGroup: true, forTaxGroupOnly: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.taxGroupSubTax.findMany({
        where: { taxGroup: { businessId: bizId } },
        select: { taxGroupId: true, taxRateId: true, taxRate: { select: { rate: true } } },
      }),
      // Purchases: the document's tax, attributed to the PO's own rate.
      prisma.$queryRaw`
        SELECT po.id, po.order_date AS date, po.po_number AS ref,
               po.total_amount AS total, po.tax_amount AS tax, po.discount_amount AS discount,
               po.tax_rate_id, po.payment_status,
               s.name AS contact_name, s.tax_number AS contact_tax_number
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND po.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR po.supplier_id = ${contact}::uuid)
        ORDER BY po.order_date DESC
        LIMIT 5000
      `,
      // Sales: one row per sale. Its tax splits across the rates its LINES
      // carry, with any order-level remainder (Add Sale's order tax) attributed
      // to the sale's own rate — see saleLineTax below.
      prisma.$queryRaw`
        SELECT s.id, s.created_at AS date,
               COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS ref,
               s.total_amount AS total, s.discount_amount AS discount,
               s.payment_method, s.tax_amount AS tax, s.tax_rate_id,
               c.name AS contact_name, c.tax_number AS contact_tax_number
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded')
          AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
          AND s.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
        ORDER BY s.created_at DESC
        LIMIT 5000
      `,
      // Expenses: refunds flip the sign so a refunded expense reverses its tax.
      prisma.$queryRaw`
        SELECT e.id, e.expense_date AS date, e.expense_number AS ref,
               (CASE WHEN e.is_refund THEN -e.amount ELSE e.amount END) AS total,
               (CASE WHEN e.is_refund THEN -e.tax_amount ELSE e.tax_amount END) AS tax,
               e.tax_rate_id, e.payment_status,
               c.name AS contact_name, c.tax_number AS contact_tax_number,
               (SELECT ep.method FROM expense_payments ep WHERE ep.expense_id = e.id ORDER BY ep.paid_on DESC LIMIT 1) AS payment_method
        FROM expenses e
        LEFT JOIN customers c ON c.id = e.contact_id
        WHERE e.business_id = ${bizId}::uuid
          AND e.expense_date >= ${fromDate} AND e.expense_date < ${toEnd}
          AND e.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR e.contact_id = ${contact}::uuid)
        ORDER BY e.expense_date DESC
        LIMIT 5000
      `,
      // Per-sale, per-rate line tax — scoped to exactly the sales above, so it
      // can neither grow unbounded nor drop lines for a sale that is shown.
      prisma.$queryRaw`
        WITH shown AS (
          SELECT s.id FROM sales s
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND s.tax_amount <> 0
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
          ORDER BY s.created_at DESC
          LIMIT 5000
        )
        SELECT si.sale_id, si.tax_rate_id, SUM(si.tax_amount)::numeric AS tax
        FROM sale_items si JOIN shown ON shown.id = si.sale_id
        WHERE si.tax_amount <> 0
        GROUP BY si.sale_id, si.tax_rate_id
      `,
      // Sell returns reverse output tax. Refunds carry no tax column, so each
      // returned line's tax is its share of the original line's tax, and its
      // rate is the line's rate — booked in the period the refund was issued.
      prisma.$queryRaw`
        SELECT r.id, r.created_at AS date,
               COALESCE(r.refund_number, LEFT(r.id::text, 8)) AS ref,
               r.refund_method AS payment_method,
               c.name AS contact_name, c.tax_number AS contact_tax_number,
               si.tax_rate_id,
               SUM(ri.quantity * (si.tax_amount / NULLIF(si.quantity, 0)))::numeric AS tax,
               SUM(ri.total_price)::numeric AS total
        FROM refund_items ri
        JOIN refunds r ON r.id = ri.refund_id
        JOIN sale_items si ON si.id = ri.sale_item_id
        JOIN sales s ON s.id = r.sale_id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND si.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
        GROUP BY r.id, r.created_at, r.refund_number, r.refund_method, c.name, c.tax_number, si.tax_rate_id
      `,
      // Purchase returns reverse input tax, at the rate of the PO they came from.
      prisma.$queryRaw`
        SELECT pr.id, pr.return_date AS date,
               COALESCE(pr.return_number, LEFT(pr.id::text, 8)) AS ref,
               pr.total_amount AS total, pr.tax_amount AS tax,
               po.tax_rate_id,
               s.name AS contact_name, s.tax_number AS contact_tax_number
        FROM purchase_returns pr
        LEFT JOIN purchase_orders po ON po.id = pr.po_id
        LEFT JOIN suppliers s ON s.id = pr.supplier_id
        WHERE pr.business_id = ${bizId}::uuid
          AND pr.return_date >= ${fromDate} AND pr.return_date < ${toEnd}
          AND pr.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR pr.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR pr.supplier_id = ${contact}::uuid)
      `,
      // Unbounded per-rate aggregates so the totals and the overall position
      // stay exact even when a register's rows hit the 5,000 display cap.
      prisma.$queryRaw`
        SELECT po.tax_rate_id, po.subtotal, po.discount_amount,
               SUM(po.tax_amount)::numeric AS tax, SUM(po.total_amount)::numeric AS total, COUNT(*)::int AS n
        FROM purchase_orders po
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND po.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR po.supplier_id = ${contact}::uuid)
        GROUP BY po.tax_rate_id, po.subtotal, po.discount_amount
      `,
      // Sales: line taxes by their own rate, UNION the per-sale order-level
      // remainder (plus the sale totals/counts) by the sale's rate, so the two
      // branches together sum to exactly SUM(sales.tax_amount).
      prisma.$queryRaw`
        SELECT tax_rate_id, SUM(tax)::numeric AS tax, SUM(total)::numeric AS total, SUM(n)::int AS n
        FROM (
          SELECT si.tax_rate_id,
                 SUM(si.tax_amount) AS tax, 0::numeric AS total, 0 AS n
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND s.tax_amount <> 0
            AND si.tax_amount <> 0
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
          GROUP BY si.tax_rate_id
          UNION ALL
          SELECT COALESCE(s.tax_rate_id, ${bset.default_sale_tax || null}::uuid),
                 SUM(s.tax_amount - COALESCE(li.line_tax, 0)) AS tax,
                 SUM(s.total_amount) AS total,
                 COUNT(*) AS n
          FROM sales s
          LEFT JOIN LATERAL (
            SELECT SUM(si.tax_amount) AS line_tax FROM sale_items si WHERE si.sale_id = s.id
          ) li ON TRUE
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND s.tax_amount <> 0
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
          -- Positional: repeating the COALESCE would bind a SECOND parameter,
          -- which Postgres will not match against the select-list expression.
          GROUP BY 1
        ) u
        GROUP BY tax_rate_id
      `,
      prisma.$queryRaw`
        SELECT e.tax_rate_id,
               SUM(CASE WHEN e.is_refund THEN -e.tax_amount ELSE e.tax_amount END)::numeric AS tax,
               SUM(CASE WHEN e.is_refund THEN -e.amount ELSE e.amount END)::numeric AS total,
               COUNT(*)::int AS n
        FROM expenses e
        WHERE e.business_id = ${bizId}::uuid
          AND e.expense_date >= ${fromDate} AND e.expense_date < ${toEnd}
          AND e.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR e.contact_id = ${contact}::uuid)
        GROUP BY e.tax_rate_id
      `,
    ]);

    // Group id → [{ rateId, weight }] normalised so the weights sum to 1.
    const groupSplit = new Map();
    for (const st of subTaxes) {
      if (!groupSplit.has(st.taxGroupId)) groupSplit.set(st.taxGroupId, []);
      groupSplit.get(st.taxGroupId).push({ rateId: st.taxRateId, rate: plNum(st.taxRate?.rate) });
    }
    for (const [, parts] of groupSplit) {
      const sum = parts.reduce((s, p) => s + p.rate, 0);
      parts.forEach(p => { p.weight = sum > 0 ? p.rate / sum : 1 / parts.length; });
    }

    // Spread one row's tax across the rate columns it belongs to.
    const splitTax = (rateId, amount) => {
      const out = {};
      const amt = plRound(amount);
      if (!amt) return out;
      const parts = rateId ? groupSplit.get(rateId) : null;
      if (parts && parts.length) {
        // Give the remainder to the largest component so the parts sum exactly.
        let left = amt, biggest = 0;
        parts.forEach((p, i) => {
          const share = plRound(amt * p.weight);
          out[p.rateId] = share;
          left = plRound(left - share);
          if (p.weight > parts[biggest].weight) biggest = i;
        });
        if (left) out[parts[biggest].rateId] = plRound(out[parts[biggest].rateId] + left);
      } else {
        out[rateId || 'untaxed'] = amt;
      }
      return out;
    };

    const mergeInto = (target, add) => {
      for (const [k, v] of Object.entries(add)) target[k] = plRound((target[k] || 0) + v);
      return target;
    };

    // byRate defaults to the whole tax under the row's own rate; sales override
    // it with their per-line split.
    const shape = (rows, byRateOf) => rows.map(r => {
      const tax = plRound(plNum(r.tax));
      return {
        id: r.id,
        date: r.date,
        ref: r.ref || String(r.id).slice(0, 8),
        contact: r.contact_name || null,
        tax_number: r.contact_tax_number || null,
        total: plRound(plNum(r.total)),
        discount: plRound(plNum(r.discount)),
        payment_method: r.payment_method || r.payment_status || null,
        tax,
        by_rate: byRateOf ? byRateOf(r, tax) : splitTax(r.tax_rate_id, tax),
      };
    });

    const lineTaxBySale = new Map();
    for (const l of saleLineTax) {
      if (!lineTaxBySale.has(l.sale_id)) lineTaxBySale.set(l.sale_id, []);
      lineTaxBySale.get(l.sale_id).push({ rateId: l.tax_rate_id, tax: plRound(plNum(l.tax)) });
    }

    // A POS sale without its own rate still carries order tax at the till's
    // configured default rate.
    const defaultSaleRate = bset.default_sale_tax || null;

    const input = [
      ...shape(purchases),
      // Purchase returns reverse input tax, at the originating PO's rate.
      ...shape(purchaseReturns).map(r => ({
        ...r, kind: 'return',
        total: plRound(-r.total), tax: plRound(-r.tax),
        by_rate: splitTax(r.tax_rate_id, plRound(-r.tax)),
      })),
    ].filter(r => r.tax !== 0);

    const output = [
      ...shape(sales, (r, tax) => {
        const lines = lineTaxBySale.get(r.id) || [];
        const acc = {};
        let covered = 0;
        for (const l of lines) {
          mergeInto(acc, splitTax(l.rateId, l.tax));
          covered = plRound(covered + l.tax);
        }
        // Whatever the lines don't account for is the order-level tax, which
        // belongs to the sale's own rate (or the till default).
        const remainder = plRound(tax - covered);
        if (remainder) mergeInto(acc, splitTax(r.tax_rate_id || defaultSaleRate, remainder));
        return acc;
      }),
      // Sell returns reverse output tax in the period they were issued, so the
      // filed liability matches the ledger's tax reversal.
      ...(() => {
        const byRefund = new Map();
        for (const r of sellReturns) {
          const cur = byRefund.get(r.id) || {
            id: r.id, date: r.date, ref: r.ref, kind: 'return',
            contact: r.contact_name || null, tax_number: r.contact_tax_number || null,
            payment_method: r.payment_method || null,
            total: 0, tax: 0, by_rate: {}, discount: 0,
          };
          const tax = plRound(-plNum(r.tax));
          cur.total = plRound(cur.total - plNum(r.total));
          cur.tax = plRound(cur.tax + tax);
          mergeInto(cur.by_rate, splitTax(r.tax_rate_id, tax));
          byRefund.set(r.id, cur);
        }
        return [...byRefund.values()];
      })(),
    ].filter(r => r.tax !== 0);

    const expense = shape(expenses).filter(r => r.tax !== 0);

    // Totals come from the UNBOUNDED aggregates so they stay exact when a
    // register's rows hit the display cap; the reversal rows (which are never
    // capped) are folded in on top. Payment-method counts describe the rows
    // actually returned.
    const totalsOf = (agg, extraRows, rows) => {
      const byRate = {};
      let total = 0, tax = 0, count = 0;
      for (const a of agg) {
        const t = plRound(plNum(a.tax));
        total = plRound(total + plNum(a.total));
        tax = plRound(tax + t);
        count += Number(a.n) || 0;
        mergeInto(byRate, splitTax(a.tax_rate_id, t));
      }
      for (const r of extraRows) {
        total = plRound(total + r.total);
        tax = plRound(tax + r.tax);
        count += 1;
        mergeInto(byRate, r.by_rate);
      }
      const methods = {};
      for (const r of rows) if (r.payment_method) methods[r.payment_method] = (methods[r.payment_method] || 0) + 1;
      return { total, tax, by_rate: byRate, by_method: methods, count };
    };

    const isReturn = (r) => r.kind === 'return';
    const inputT = totalsOf(purchaseAgg, input.filter(isReturn), input);
    const outputT = totalsOf(salesAgg, output.filter(isReturn), output);
    const expenseT = totalsOf(expenseAgg, [], expense);

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      contact_id: contact,
      // Components first so grouped rates read left-to-right like the reference.
      rates: rates.map(r => ({
        id: r.id, name: r.name,
        rate_pct: plRound(plNum(r.rate) * 100),
        is_group: r.isTaxGroup, component: r.forTaxGroupOnly, is_active: r.isActive,
      })),
      input, output, expense,
      totals: { input: inputT, output: outputT, expense: expenseT },
      overall: { net_tax: plRound(outputT.tax - inputT.tax - expenseT.tax) },
      limited: {
        input: purchases.length === 5000,
        output: sales.length === 5000,
        expense: expenses.length === 5000,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
