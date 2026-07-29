// ── Profit / Loss report ─────────────────────────────────────────────────────
// Reference-parity statement: a Costs & Deductions column against a Revenue &
// Income column, periodic COGS (opening stock + net purchases − closing stock),
// gross/net profit with margins, and an informational tax summary.
//
// Stock values are reconstructed from cost layers:
//   value at date = current layer value − receipts after the date
//                   + consumption after the date
// where consumption is sales at their posted line cost, adjustment documents at
// their consumed FEFO cost, and purchase returns at landed cost. The sale-price
// figures use today's selling prices, so they are indicative. Transfers move
// stock_levels but not layers, so per-location stock values drift for
// businesses that transfer between branches (matches /stock/valuation).
//
// A sale that was later refunded keeps its full amounts in the sales rows; the
// refund appears as Sell Return (ex-tax, pro-rated like the GL reversal).

// Sales that posted stock + GL effects. Refunded sales stay in the totals —
// their reversal is the separate Sell Return line.

const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange } = require('./_shared');

const router = express.Router();

router.get('/profit-loss', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const fromMonth = (req.query.from || '2000-01-01').slice(0, 7);
    const toMonth = (req.query.to || '2099-12-31').slice(0, 7);

    const [
      sales, refunds, expenses, purchases, purchaseReturns, transfers,
      adjDocs, adjLegacy, recovered, payroll, layers, saleOut, adjOut, prOut,
      reqOut, lineCogs,
    ] = await Promise.all([
      // Sales: subtotal is goods ex-tax after line discounts but BEFORE the
      // order-level discount/coupon/reward, which sit in the costs column.
      prisma.sale.aggregate({
        where: {
          businessId: bizId, status: { in: PL_POSTED },
          createdAt: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: {
          subtotal: true, discountAmount: true, couponDiscount: true,
          loyaltyDiscount: true, taxAmount: true, shippingCharges: true,
          expensesTotal: true, totalAmount: true,
          packingCharge: true, serviceCharge: true, tipAmount: true,
        },
        _count: { id: true },
      }),
      // Refunds are built from the sale items' ex-tax unit prices, so
      // total_refunded is already ex-tax — no tax share to strip here.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(r.total_refunded), 0)::float AS total
        FROM refunds r JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      `,
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END), 0)::float AS total,
          COALESCE(SUM(CASE WHEN is_refund THEN -tax_amount ELSE tax_amount END), 0)::float AS tax
        FROM expenses
        WHERE business_id = ${bizId}::uuid
          AND expense_date >= ${fromDate} AND expense_date < ${toEnd}
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
      `,
      // Purchases whose goods actually arrived. Subtotal is gross of the
      // supplier discount, which shows on the income side like the reference.
      prisma.purchaseOrder.aggregate({
        where: {
          businessId: bizId, status: { in: ['partial', 'received'] },
          orderDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { subtotal: true, discountAmount: true, taxAmount: true, freightCost: true, customsDuty: true, otherCharges: true },
      }),
      prisma.purchaseReturn.aggregate({
        where: {
          businessId: bizId,
          returnDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { subtotal: true, taxAmount: true },
      }),
      prisma.stockTransfer.aggregate({
        where: {
          businessId: bizId, status: { not: 'cancelled' },
          transferDate: { gte: fromDate, lt: toEnd },
          ...(loc && { OR: [{ fromLocationId: loc }, { toLocationId: loc }] }),
        },
        _sum: { shippingCharges: true },
      }),
      // Adjustment documents, valued at what the GL was actually charged.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(i.total_cost), 0)::float AS total
        FROM stock_adjustment_doc_items i
        JOIN stock_adjustment_docs d ON d.id = i.doc_id
        WHERE d.business_id = ${bizId}::uuid
          AND COALESCE(d.adjustment_date, d.created_at) >= ${fromDate}
          AND COALESCE(d.adjustment_date, d.created_at) < ${toEnd}
          AND (${loc}::uuid IS NULL OR d.location_id = ${loc}::uuid)
      `,
      // Legacy single-line adjustments: negative quantity = loss, positive
      // (found) = gain, valued like the approve flow (unit cost, else product cost).
      prisma.$queryRaw`
        SELECT COALESCE(SUM(
          (CASE WHEN a.quantity < 0 THEN 1 ELSE -1 END) *
          ABS(a.quantity) * (CASE WHEN a.unit_cost > 0 THEN a.unit_cost ELSE p.cost_price END)
        ), 0)::float AS total
        FROM stock_adjustments a JOIN products p ON p.id = a.product_id
        WHERE a.business_id = ${bizId}::uuid AND a.status = 'approved'
          AND COALESCE(a.approved_at, a.created_at) >= ${fromDate}
          AND COALESCE(a.approved_at, a.created_at) < ${toEnd}
          AND (${loc}::uuid IS NULL OR a.location_id = ${loc}::uuid)
      `,
      prisma.$queryRaw`
        SELECT COALESCE(SUM(total_recovered), 0)::float AS total
        FROM stock_adjustment_docs
        WHERE business_id = ${bizId}::uuid
          AND COALESCE(adjustment_date, created_at) >= ${fromDate}
          AND COALESCE(adjustment_date, created_at) < ${toEnd}
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
      `,
      // Payroll is keyed by month string; gross pay, like the 5100 posting.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(p.basic + p.allowance + p.overtime + p.bonus + p.incentive), 0)::float AS total
        FROM payrolls p JOIN employees e ON e.id = p.employee_id
        WHERE p.business_id = ${bizId}::uuid
          AND p.month >= ${fromMonth} AND p.month <= ${toMonth}
          AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
      `,
      // Stock reconstruction: current layers + receipts after each boundary,
      // with the PO-linked share broken out for the period reconciliation.
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(cl.quantity_remaining * cl.unit_cost) FILTER (WHERE cl.quantity_remaining > 0), 0)::float AS cur_cost,
          COALESCE(SUM(cl.quantity_remaining * p.selling_price) FILTER (WHERE cl.quantity_remaining > 0), 0)::float AS cur_sale,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.received_at >= ${fromDate}), 0)::float AS in_cost_from,
          COALESCE(SUM(cl.quantity_received * p.selling_price) FILTER (WHERE cl.received_at >= ${fromDate}), 0)::float AS in_sale_from,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.received_at >= ${toEnd}), 0)::float AS in_cost_to,
          COALESCE(SUM(cl.quantity_received * p.selling_price) FILTER (WHERE cl.received_at >= ${toEnd}), 0)::float AS in_sale_to,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.po_id IS NOT NULL AND cl.received_at >= ${fromDate} AND cl.received_at < ${toEnd}), 0)::float AS po_cost_period,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.po_id IS NULL AND cl.received_at >= ${fromDate} AND cl.received_at < ${toEnd}), 0)::float AS other_cost_period
        FROM cost_layers cl JOIN products p ON p.id = cl.product_id
        WHERE cl.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR cl.location_id = ${loc}::uuid)
      `,
      // ...consumption after each boundary: sales. cost_price > 0 is the mark
      // of a line that actually consumed layers (services carry 0; recipe lines
      // carry the ingredients' cost even though the finished good is unstocked).
      // Cancelled (voided) sales stay IN: their consumption pairs with the
      // restock layer the void created, keeping boundaries before the void true.
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(si.cost_price * si.quantity) FILTER (WHERE s.created_at >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(si.quantity * p.selling_price) FILTER (WHERE s.created_at >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(si.cost_price * si.quantity) FILTER (WHERE s.created_at >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(si.quantity * p.selling_price) FILTER (WHERE s.created_at >= ${toEnd}), 0)::float AS sale_to
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded', 'cancelled')
          AND si.cost_price > 0
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      `,
      // ...adjustment documents...
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(i.total_cost) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(i.total_cost) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${toEnd}), 0)::float AS sale_to
        FROM stock_adjustment_doc_items i
        JOIN stock_adjustment_docs d ON d.id = i.doc_id
        JOIN products p ON p.id = i.product_id
        WHERE d.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR d.location_id = ${loc}::uuid)
      `,
      // ...and purchase returns (landed cost; qty is in purchase units, so the
      // sale-price side is approximate when purchase units differ).
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(i.total_price) FILTER (WHERE r.return_date >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE r.return_date >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(i.total_price) FILTER (WHERE r.return_date >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE r.return_date >= ${toEnd}), 0)::float AS sale_to
        FROM purchase_return_items i
        JOIN purchase_returns r ON r.id = i.purchase_return_id
        JOIN products p ON p.id = i.product_id
        WHERE r.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR r.location_id = ${loc}::uuid)
      `,
      // ...and construction material requisitions, which consume layers and
      // post project-materials COGS. Scoped through the owning project.
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(i.line_cost) FILTER (WHERE mr.created_at >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE mr.created_at >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(i.line_cost) FILTER (WHERE mr.created_at >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE mr.created_at >= ${toEnd}), 0)::float AS sale_to
        FROM material_requisition_items i
        JOIN material_requisitions mr ON mr.id = i.requisition_id
        JOIN projects pr ON pr.id = mr.project_id
        JOIN products p ON p.id = i.product_id
        WHERE pr.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR i.location_id = ${loc}::uuid)
      `,
      // Transactional COGS for the period: FIFO line costs of sales made in the
      // period, minus the cost credited back by restocked returns refunded in
      // the period (mirrors the GL's Dr 5000 / Cr 5000 pair). Voided sales are
      // excluded together with their revenue — economically they never happened.
      prisma.$queryRaw`
        SELECT
          COALESCE((
            SELECT SUM(si.cost_price * si.quantity)
            FROM sale_items si JOIN sales s ON s.id = si.sale_id
            WHERE s.business_id = ${bizId}::uuid
              AND s.status IN ('completed', 'refunded', 'partially_refunded')
              AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
              AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          ), 0)::float AS sold,
          COALESCE((
            SELECT SUM(ri.quantity * si.cost_price)
            FROM refund_items ri
            JOIN refunds r ON r.id = ri.refund_id
            JOIN sale_items si ON si.id = ri.sale_item_id
            JOIN sales s ON s.id = r.sale_id
            WHERE r.business_id = ${bizId}::uuid AND ri.restock = true
              AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
              AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          ), 0)::float AS restocked
      `,
    ]);

    const L = layers[0] || {}, SO = saleOut[0] || {}, AO = adjOut[0] || {}, PO = prOut[0] || {}, RQ = reqOut[0] || {};
    const stockAt = (side, bound) => Math.max(0, plRound(
      plNum(L['cur_' + side]) - plNum(L[`in_${side}_${bound}`])
      + plNum(SO[`${side}_${bound}`]) + plNum(AO[`${side}_${bound}`])
      + plNum(PO[`${side}_${bound}`]) + plNum(RQ[`${side}_${bound}`])
    ));
    const openingCost = stockAt('cost', 'from'), openingSale = stockAt('sale', 'from');
    const closingCost = stockAt('cost', 'to'), closingSale = stockAt('sale', 'to');

    const ss = sales._sum;
    const ps = purchases._sum;
    const projectMaterials = plRound(plNum(RQ.cost_from) - plNum(RQ.cost_to));

    // Reference-parity display columns. The stock rows and the document-based
    // purchase rows are the reconciliation view; the summary below is computed
    // transactionally, so partial receipts, undocumented opening stock or
    // freight folded into landed layer costs cannot distort profit.
    const left = {
      opening_stock_purchase: openingCost,
      opening_stock_sale: openingSale,
      total_purchase: plRound(plNum(ps.subtotal)),
      stock_adjustment: plRound(plNum(adjDocs[0]?.total) + plNum(adjLegacy[0]?.total)),
      total_expense: plRound(plNum(expenses[0]?.total)),
      // Freight/customs/other are allocated into layer unit costs at receipt
      // (landed cost), so they reach profit through COGS — these two rows are
      // informational and excluded from other_expense to avoid double-counting.
      purchase_shipping: plRound(plNum(ps.freightCost)),
      purchase_additional_expenses: plRound(plNum(ps.customsDuty) + plNum(ps.otherCharges)),
      transfer_shipping: plRound(plNum(transfers._sum.shippingCharges)),
      sell_discount: plRound(plNum(ss.discountAmount) + plNum(ss.couponDiscount)),
      customer_reward: plRound(plNum(ss.loyaltyDiscount)),
      sell_return: plRound(plNum(refunds[0]?.total)),
      payroll: plRound(plNum(payroll[0]?.total)),
      project_materials: projectMaterials,
    };
    const right = {
      closing_stock_purchase: closingCost,
      closing_stock_sale: closingSale,
      total_sales: plRound(plNum(ss.subtotal)),
      sell_shipping: plRound(plNum(ss.shippingCharges)),
      sell_additional_expenses: plRound(plNum(ss.expensesTotal)),
      pos_charges: plRound(plNum(ss.packingCharge) + plNum(ss.serviceCharge) + plNum(ss.tipAmount)),
      stock_recovered: plRound(plNum(recovered[0]?.total)),
      purchase_return: plRound(plNum(purchaseReturns._sum.subtotal)),
      purchase_discount: plRound(plNum(ps.discountAmount)),
      round_off: 0, // rounding is not modelled on sales; kept for reference parity
    };

    // Transactional profit: COGS is the FIFO cost of the lines actually sold in
    // the period, net of the cost credited back by restocked returns. This is
    // the same basis as the "Profit by" breakdowns and the GL's account 5000.
    const netSales = plRound(right.total_sales - left.sell_discount - left.customer_reward - left.sell_return);
    const cogs = plRound(plNum(lineCogs[0]?.sold) - plNum(lineCogs[0]?.restocked));
    const grossProfit = plRound(netSales - cogs);
    // Order-level PO discounts never reach layer costs, so they are income here;
    // freight/customs are already inside COGS (landed) and are NOT re-expensed.
    const otherIncome = plRound(right.sell_shipping + right.sell_additional_expenses + right.pos_charges
      + right.stock_recovered + right.purchase_discount + right.round_off);
    const otherExpense = plRound(left.stock_adjustment + left.total_expense + left.transfer_shipping
      + left.payroll + left.project_materials);
    const netProfit = plRound(grossProfit + otherIncome - otherExpense);
    const pct = (n) => netSales > 0 ? plRound((n / netSales) * 100) : 0;

    const outputTax = plRound(plNum(ss.taxAmount));
    const inputTaxPurchases = plRound(plNum(ps.taxAmount) - plNum(purchaseReturns._sum.taxAmount));
    const inputTaxExpenses = plRound(plNum(expenses[0]?.tax));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      left,
      right,
      summary: {
        net_sales: netSales,
        cogs,
        gross_profit: grossProfit,
        gross_margin_pct: pct(grossProfit),
        other_income: otherIncome,
        other_expense: otherExpense,
        net_profit: netProfit,
        net_margin_pct: pct(netProfit),
        transactions: sales._count.id,
        // Reconciliation figures for the periodic identity: stock received in
        // the period at landed cost, split purchase-linked vs other inflows
        // (opening stock entries, restocked returns, void restores).
        purchases_received: plRound(plNum(L.po_cost_period)),
        stock_received_other: plRound(plNum(L.other_cost_period)),
      },
      tax: {
        output_tax: outputTax,
        input_tax_purchases: inputTaxPurchases,
        input_tax_expenses: inputTaxExpenses,
        net_tax: plRound(outputTax - inputTaxPurchases - inputTaxExpenses),
      },
    });
  } catch (err) { next(err); }
});

// ── Profit by product / category / brand / … ─────────────────────────────────
// Line profit = (line net − refunded share) − cost × (qty − restocked qty).
// Same period basis as the statement: a refund counts in the period it was
// issued. Refunds of sales from BEFORE the range enter through a second union
// branch (their sale row is outside the range); for the date/day/invoice
// groups that branch is labeled by the refund's date (s.created_at fragments
// are rewritten to r.created_at). gkey keeps distinct entities with the same
// display name apart; ord feeds the non-profit sort orders.
const PL_GROUPS = {
  product: {
    select: `p.name AS label, p.sku AS sub`, gkey: `p.id::text`,
    join: ``, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  category: {
    select: `COALESCE(c.name, 'Uncategorized') AS label, NULL::text AS sub`, gkey: `COALESCE(c.id::text, '')`,
    join: `LEFT JOIN categories c ON c.id = p.category_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  brand: {
    select: `COALESCE(b.name, 'No brand') AS label, NULL::text AS sub`, gkey: `COALESCE(b.id::text, '')`,
    join: `LEFT JOIN brands b ON b.id = p.brand_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  location: {
    select: `COALESCE(l.name, 'No location') AS label, NULL::text AS sub`, gkey: `COALESCE(l.id::text, '')`,
    join: `LEFT JOIN locations l ON l.id = s.location_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  invoice: {
    select: `COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS label,
             TO_CHAR(s.created_at, 'YYYY-MM-DD') || COALESCE(' · ' || cu.name, '') AS sub`,
    gkey: `s.id::text`,
    join: `LEFT JOIN customers cu ON cu.id = s.customer_id`,
    ord: `s.created_at`, outerOrder: `MAX(ord) DESC`,
  },
  date: {
    select: `TO_CHAR(DATE(s.created_at), 'YYYY-MM-DD') AS label, NULL::text AS sub`, gkey: `''`,
    join: ``, ord: `NULL::timestamp`, outerOrder: `label DESC`,
  },
  customer: {
    select: `COALESCE(cu.name, 'Walk-in Customer') AS label, NULL::text AS sub`, gkey: `COALESCE(cu.id::text, '')`,
    join: `LEFT JOIN customers cu ON cu.id = s.customer_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  day: {
    select: `TO_CHAR(s.created_at, 'FMDay') AS label, NULL::text AS sub`, gkey: `''`,
    join: ``, ord: `s.created_at`, outerOrder: `MIN(EXTRACT(DOW FROM ord))`,
  },
  staff: {
    select: `COALESCE(u.name, '—') AS label, NULL::text AS sub`, gkey: `COALESCE(u.id::text, '')`,
    join: `LEFT JOIN users u ON u.id = s.cashier_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
};

router.get('/profit-loss/by', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    // hasOwnProperty guard: ?group=constructor must not reach the prototype.
    const g = Object.prototype.hasOwnProperty.call(PL_GROUPS, String(req.query.group))
      ? PL_GROUPS[req.query.group] : null;
    if (!g) return res.status(400).json({ title: `group must be one of: ${Object.keys(PL_GROUPS).join(', ')}.`, status: 400 });
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    // Same period basis as the statement: refunds count when they happen, and
    // only restocked returns credit cost back (unrestocked goods stay in COGS).
    // Branch 1: sales made in the period, net of in-period refunds on them.
    // Branch 2: in-period refunds whose sale predates the period — labeled by
    // the refund's date for the time-keyed groups.
    // Group fragments are static strings from the whitelist above — never user
    // input — so Prisma.raw is safe here; all values stay bound parameters.
    const selRefund = g.select.split('s.created_at').join('r.created_at');
    const ordRefund = g.ord.split('s.created_at').join('r.created_at');
    const u = Prisma.sql`
      rf AS (
        SELECT ri.sale_item_id,
               SUM(ri.quantity)::int AS qty,
               SUM(ri.quantity) FILTER (WHERE ri.restock) AS qty_restocked,
               SUM(ri.total_price) AS amount
        FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
        WHERE r.business_id = ${bizId}::uuid AND ri.sale_item_id IS NOT NULL
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
        GROUP BY ri.sale_item_id
      ),
      u AS (
        SELECT ${Prisma.raw(g.gkey)} AS gkey, ${Prisma.raw(g.select)}, ${Prisma.raw(g.ord)} AS ord,
               (si.quantity - COALESCE(rf.qty, 0))::float AS qty,
               -- Refunded units valued at the line's effective (post-discount)
               -- price; refund_items carry the original, pre-discount price.
               (si.total_price - COALESCE(rf.qty, 0) * (si.total_price / NULLIF(si.quantity, 0)))::float AS sales,
               ((si.total_price - COALESCE(rf.qty, 0) * (si.total_price / NULLIF(si.quantity, 0))) - si.cost_price * (si.quantity - COALESCE(rf.qty_restocked, 0)))::float AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        LEFT JOIN rf ON rf.sale_item_id = si.id
        ${Prisma.raw(g.join)}
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded')
          AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
        UNION ALL
        SELECT ${Prisma.raw(g.gkey)} AS gkey, ${Prisma.raw(selRefund)}, ${Prisma.raw(ordRefund)} AS ord,
               (-ri.quantity)::float AS qty,
               (-ri.total_price)::float AS sales,
               (-(ri.total_price - si.cost_price * (CASE WHEN ri.restock THEN ri.quantity ELSE 0 END)))::float AS profit
        FROM refund_items ri
        JOIN refunds r ON r.id = ri.refund_id
        JOIN sale_items si ON si.id = ri.sale_item_id
        JOIN sales s ON s.id = r.sale_id
        JOIN products p ON p.id = si.product_id
        ${Prisma.raw(g.join)}
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND NOT (s.created_at >= ${fromDate} AND s.created_at < ${toEnd})
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      )`;

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        WITH ${u}
        SELECT label, sub,
          COALESCE(SUM(qty), 0)::float AS qty,
          COALESCE(SUM(sales), 0)::float AS sales,
          COALESCE(SUM(profit), 0)::float AS profit
        FROM u
        GROUP BY gkey, label, sub
        ORDER BY ${Prisma.raw(g.outerOrder)}
        LIMIT 1000
      `),
      // Grand totals over the WHOLE filtered set — not just the shown rows.
      prisma.$queryRaw(Prisma.sql`
        WITH ${u}
        SELECT COALESCE(SUM(qty), 0)::float AS qty,
               COALESCE(SUM(sales), 0)::float AS sales,
               COALESCE(SUM(profit), 0)::float AS profit
        FROM u
      `),
    ]);

    const out = rows.map(r => ({
      label: r.label || '—', sub: r.sub || null,
      qty: plNum(r.qty), sales: plRound(plNum(r.sales)), profit: plRound(plNum(r.profit)),
    }));
    const t = totalRows[0] || {};
    res.json({
      group: req.query.group,
      rows: out,
      totals: { qty: plNum(t.qty), sales: plRound(plNum(t.sales)), profit: plRound(plNum(t.profit)) },
      limited: rows.length === 1000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
