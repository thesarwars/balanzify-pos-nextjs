

const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange } = require('./_shared');

const router = express.Router();

// ── Purchase & Sale report ───────────────────────────────────────────────────
// Reference parity: purchase totals (ex/inc tax), returns, supplier dues vs
// sale totals, sell returns and receivables for the range, plus the overall
// (sale − sell return) − (purchase − purchase return) and net due lines.
// Purchases count once goods arrived (partial/received), like the P&L; sales
// are posted documents; returns count in the period they were issued.
// Period basis: sales/refunds by created_at, purchases by order_date — the
// same uniform convention every report in this file uses. A back-dated
// invoice therefore lands in its entry period, consistently across reports.
router.get('/purchase-sale', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const [po, poDue, pret, sales, refunds] = await Promise.all([
      prisma.purchaseOrder.aggregate({
        where: {
          businessId: bizId, status: { in: ['partial', 'received'] },
          orderDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { totalAmount: true, taxAmount: true },
      }),
      // Per-PO due = what was actually received (landed layer value, the same
      // basis the supplier balance/AP is maintained on) minus returns minus
      // payments, clamped per order so an overpaid PO can't offset another's.
      // A half-received PO owes only its received half; a fully returned one
      // owes nothing.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(GREATEST(
          COALESCE((SELECT SUM(cl.quantity_received * cl.unit_cost) FROM cost_layers cl WHERE cl.po_id = po.id), 0)
          - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr WHERE pr.po_id = po.id), 0)
          - po.amount_paid, 0)), 0)::float AS due
        FROM purchase_orders po
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
      `,
      prisma.purchaseReturn.aggregate({
        where: {
          businessId: bizId,
          returnDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { totalAmount: true },
      }),
      prisma.sale.aggregate({
        where: {
          businessId: bizId, status: { in: PL_POSTED },
          createdAt: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { totalAmount: true, taxAmount: true, amountDue: true },
      }),
      prisma.$queryRaw`
        SELECT COALESCE(SUM(r.total_refunded), 0)::float AS total
        FROM refunds r JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      `,
    ]);

    const purchaseInc = plRound(plNum(po._sum.totalAmount));
    const purchaseEx = plRound(purchaseInc - plNum(po._sum.taxAmount));
    const purchaseReturns = plRound(plNum(pret._sum.totalAmount));
    const purchaseDue = plRound(plNum(poDue[0]?.due));
    const saleInc = plRound(plNum(sales._sum.totalAmount));
    const saleEx = plRound(saleInc - plNum(sales._sum.taxAmount));
    // Refunds are stored ex-tax (built from ex-tax unit prices).
    const sellReturns = plRound(plNum(refunds[0]?.total));
    const saleDue = plRound(plNum(sales._sum.amountDue));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      purchases: {
        total_ex_tax: purchaseEx,
        total_inc_tax: purchaseInc,
        returns: purchaseReturns,   // stored ex-tax (created with taxAmount 0)
        due: purchaseDue,
      },
      sales: {
        total_ex_tax: saleEx,
        total_inc_tax: saleInc,
        returns: sellReturns,       // ex-tax, built from ex-tax unit prices
        due: saleDue,
      },
      overall: {
        // Netted on ONE tax basis (ex-tax) — both return figures are stored
        // ex-tax, so netting them against inc-tax totals would leave the
        // returned goods' tax share behind in the overall line.
        sale_minus_purchase: plRound((saleEx - sellReturns) - (purchaseEx - purchaseReturns)),
        due_amount: plRound(saleDue - purchaseDue),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
