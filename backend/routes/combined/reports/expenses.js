// Expense report: total expense per category for a location + date range,
// driving both the chart and the table. Refunded expenses subtract, matching
// the P&L's expense line.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

router.get('/expenses', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const category = req.query.category_id || null;
    if (category && !(typeof category === 'string' && PL_UUID_RE.test(category))) {
      return res.status(400).json({ title: 'category_id must be a UUID.', status: 400 });
    }

    // Group by the top-level category: an expense filed under a sub-category
    // rolls up to its parent, so the chart has one bar per real category.
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(parent.id, c.id)::text AS gid,
             COALESCE(parent.name, c.name, 'Uncategorized') AS label,
             SUM(CASE WHEN e.is_refund THEN -e.amount ELSE e.amount END)::float AS total,
             COUNT(*)::int AS count
      FROM expenses e
      LEFT JOIN expense_categories c ON c.id = e.category_id
      LEFT JOIN expense_categories parent ON parent.id = c.parent_id
      WHERE e.business_id = ${bizId}::uuid
        AND e.expense_date >= ${fromDate} AND e.expense_date < ${toEnd}
        AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
        AND (${category}::uuid IS NULL OR e.category_id = ${category}::uuid OR c.parent_id = ${category}::uuid)
      GROUP BY 1, 2
      ORDER BY total DESC
      LIMIT 5000
    `;

    const out = rows.map(r => ({
      label: r.label,
      total: plRound(plNum(r.total)),
      count: Number(r.count) || 0,
    }));
    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc, category_id: category,
      rows: out,
      totals: {
        total: plRound(out.reduce((s, r) => s + r.total, 0)),
        count: out.reduce((s, r) => s + r.count, 0),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
