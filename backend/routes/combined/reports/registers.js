// Register report: one row per cash-register session (shift) with the money
// taken in it broken down by payment method.
//
// The reference hard-codes columns for its seven configurable payment types;
// this business's methods are whatever the payment registry offers (cash,
// zaad, evc, edahab, mpesa, telebirr, card, bank, …), so the breakdown is
// returned as a per-method map plus the list of methods actually used, and the
// screen builds a column per method — the same approach as the tax report's
// per-rate columns. Only settled tenders count, and the synthetic `credit`
// tender is excluded because nothing was collected into the till for it.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

router.get('/register-report', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const user = req.query.user_id || null;
    if (user && !(typeof user === 'string' && PL_UUID_RE.test(user))) {
      return res.status(400).json({ title: 'user_id must be a UUID.', status: 400 });
    }
    const status = req.query.status || null;
    if (status && !['open', 'closed'].includes(status)) {
      return res.status(400).json({ title: 'status must be open or closed.', status: 400 });
    }

    const [shifts, byMethod] = await Promise.all([
      prisma.shift.findMany({
        where: {
          businessId: bizId,
          openedAt: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
          ...(user && { cashierId: user }),
          ...(status && { status }),
        },
        select: {
          id: true, openedAt: true, closedAt: true, status: true,
          openingFloat: true, closingFloat: true, expectedCash: true, actualCash: true, variance: true,
          totalSales: true, totalTransactions: true,
          location: { select: { name: true } },
          cashier: { select: { name: true, email: true } },
        },
        orderBy: { openedAt: 'desc' },
        take: 5000,
      }),
      // Real tenders per shift. `credit` is a receivable, not money in the
      // till, so it is excluded — the same rule the payment reports use.
      prisma.$queryRaw`
        SELECT s.shift_id, sp.provider AS method, SUM(sp.amount)::float AS amount, COUNT(*)::int AS n
        FROM sale_payments sp
        JOIN sales s ON s.id = sp.sale_id
        WHERE sp.business_id = ${bizId}::uuid
          AND sp.status = 'completed'
          AND sp.provider <> 'credit'
          AND s.shift_id IS NOT NULL
        GROUP BY s.shift_id, sp.provider
      `,
    ]);

    const perShift = new Map();
    const methods = new Set();
    for (const m of byMethod) {
      methods.add(m.method);
      if (!perShift.has(m.shift_id)) perShift.set(m.shift_id, {});
      perShift.get(m.shift_id)[m.method] = { amount: plRound(plNum(m.amount)), count: Number(m.n) || 0 };
    }

    const rows = shifts.map(s => {
      const by = perShift.get(s.id) || {};
      const amounts = {};
      const counts = {};
      let taken = 0;
      for (const [k, v] of Object.entries(by)) {
        amounts[k] = v.amount; counts[k] = v.count; taken = plRound(taken + v.amount);
      }
      return {
        id: s.id,
        open_time: s.openedAt,
        close_time: s.closedAt,
        location: s.location?.name || '',
        user: s.cashier?.name || '',
        user_email: s.cashier?.email || '',
        status: s.status,
        opening_float: plRound(plNum(s.openingFloat)),
        closing_float: s.closingFloat == null ? null : plRound(plNum(s.closingFloat)),
        expected_cash: s.expectedCash == null ? null : plRound(plNum(s.expectedCash)),
        actual_cash: s.actualCash == null ? null : plRound(plNum(s.actualCash)),
        variance: s.variance == null ? null : plRound(plNum(s.variance)),
        total_sales: plRound(plNum(s.totalSales)),
        transactions: s.totalTransactions,
        by_method: amounts,
        by_method_count: counts,
        total_taken: taken,
      };
    });

    // Only methods this business actually took money with get a column.
    const methodList = [...methods].sort();
    const totals = { total_taken: plRound(rows.reduce((s, r) => s + r.total_taken, 0)), by_method: {} };
    for (const m of methodList) {
      totals.by_method[m] = plRound(rows.reduce((s, r) => s + (r.by_method[m] || 0), 0));
    }
    totals.total_sales = plRound(rows.reduce((s, r) => s + r.total_sales, 0));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, user_id: user, status,
      methods: methodList,
      rows, totals,
      limited: shifts.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
