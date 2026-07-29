// Sales Representative report: what a rep sold and what was spent on them.
// One summary (net sale after returns, plus expenses booked to the rep) and
// three views — sales they added, the subset that earns them commission, and
// expenses recorded for them.
//
// The rep of a sale is its cashier: that is the only person a sale records,
// and it is what the commission report already pays on.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_UUID_RE, plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

const VIEWS = ['sales_added', 'sales_commission', 'expenses'];

// Payment state is derived from the amounts, since a sale carries no status
// field for it.
const payStatus = (total, paid, due) => {
  if (plNum(due) <= 0.005) return 'paid';
  if (plNum(paid) <= 0.005) return 'due';
  return 'partial';
};

router.get('/sales-rep', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const view = req.query.view || 'sales_added';
    if (!VIEWS.includes(view)) {
      return res.status(400).json({ title: `view must be one of: ${VIEWS.join(', ')}.`, status: 400 });
    }
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const user = req.query.user_id || null;
    if (user && !(typeof user === 'string' && PL_UUID_RE.test(user))) {
      return res.status(400).json({ title: 'user_id must be a UUID.', status: 400 });
    }

    const saleWhere = {
      businessId: bizId, status: { in: PL_POSTED },
      createdAt: { gte: fromDate, lt: toEnd },
      ...(loc && { locationId: loc }),
      ...(user && { cashierId: user }),
    };
    const expenseWhere = {
      businessId: bizId,
      expenseDate: { gte: fromDate, lt: toEnd },
      ...(loc && { locationId: loc }),
      // Expenses booked FOR the rep — the reference's "Expense for".
      ...(user && { expenseForUserId: user }),
    };

    // Summary is the same on every view, so the header never jumps as you
    // switch tabs.
    const [saleAgg, returnAgg, expenseAgg] = await Promise.all([
      prisma.sale.aggregate({ where: saleWhere, _sum: { totalAmount: true, amountPaid: true, amountDue: true }, _count: { id: true } }),
      prisma.$queryRaw`
        SELECT COALESCE(SUM(r.total_refunded), 0)::float AS total
        FROM refunds r JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          AND (${user}::uuid IS NULL OR s.cashier_id = ${user}::uuid)
      `,
      prisma.expense.aggregate({
        where: expenseWhere,
        _sum: { amount: true, amountDue: true },
        _count: { id: true },
      }),
    ]);

    const totalSale = plRound(plNum(saleAgg._sum.totalAmount));
    const totalReturn = plRound(plNum(returnAgg[0]?.total));
    const summary = {
      total_sale: totalSale,
      total_sales_return: totalReturn,
      net_sale: plRound(totalSale - totalReturn),
      total_expense: plRound(plNum(expenseAgg._sum.amount)),
      sell_due: plRound(plNum(saleAgg._sum.amountDue)),
      sales_count: saleAgg._count.id,
      expenses_count: expenseAgg._count.id,
    };

    let rows = [];
    let totals = {};

    if (view === 'expenses') {
      const list = await prisma.expense.findMany({
        where: expenseWhere,
        select: {
          id: true, expenseNumber: true, expenseDate: true, amount: true,
          amountPaid: true, amountDue: true, paymentStatus: true,
          expenseFor: true, note: true,
          category: { select: { name: true } },
          location: { select: { name: true } },
          expenseForUser: { select: { name: true } },
        },
        orderBy: { expenseDate: 'desc' },
        take: 5000,
      });
      rows = list.map(e => ({
        id: e.id,
        date: e.expenseDate,
        ref: e.expenseNumber,
        category: e.category?.name || '',
        location: e.location?.name || '',
        payment_status: e.paymentStatus,
        total: plRound(plNum(e.amount)),
        expense_for: e.expenseForUser?.name || e.expenseFor || '',
        note: e.note || '',
      }));
      totals = { total: plRound(rows.reduce((s, r) => s + r.total, 0)), count: rows.length };

    } else {
      // Sales the rep added; the commission view keeps only those whose rep
      // actually earns a percentage, and prices the commission on the sale.
      const list = await prisma.sale.findMany({
        where: saleWhere,
        select: {
          id: true, saleNumber: true, createdAt: true, saleDate: true,
          totalAmount: true, amountPaid: true, amountDue: true,
          customer: { select: { name: true } },
          location: { select: { name: true } },
          cashier: { select: { id: true, name: true, commissionPercent: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const commissionOnly = view === 'sales_commission';
      rows = list
        .filter(s => !commissionOnly || plNum(s.cashier?.commissionPercent) > 0)
        .map(s => {
          const total = plRound(plNum(s.totalAmount));
          const pct = plNum(s.cashier?.commissionPercent);
          return {
            id: s.id,
            date: s.saleDate || s.createdAt,
            invoice: s.saleNumber || String(s.id).slice(0, 8),
            customer: s.customer?.name || 'Walk-In Customer',
            location: s.location?.name || '',
            payment_status: payStatus(total, s.amountPaid, s.amountDue),
            total,
            paid: plRound(plNum(s.amountPaid)),
            remaining: plRound(plNum(s.amountDue)),
            rep: s.cashier?.name || '',
            commission_percent: pct,
            commission: plRound(total * pct / 100),
          };
        });
      const byStatus = {};
      for (const r of rows) byStatus[r.payment_status] = (byStatus[r.payment_status] || 0) + 1;
      totals = {
        total: plRound(rows.reduce((s, r) => s + r.total, 0)),
        paid: plRound(rows.reduce((s, r) => s + r.paid, 0)),
        remaining: plRound(rows.reduce((s, r) => s + r.remaining, 0)),
        commission: plRound(rows.reduce((s, r) => s + r.commission, 0)),
        by_status: byStatus,
        count: rows.length,
      };
    }

    res.json({
      view,
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, user_id: user,
      summary, rows, totals,
      limited: rows.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
