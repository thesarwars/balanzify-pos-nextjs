

const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange } = require('./_shared');

const router = express.Router();

// ── Customer Groups report ───────────────────────────────────────────────────
// Total sale per customer group for the period. Customers with no group (and
// walk-in sales) roll up into an "— No group —" row, so the total ties out to
// all sales.
router.get('/customer-groups', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const rows = await prisma.$queryRaw`
      SELECT COALESCE(g.name, '— No group —') AS name,
             SUM(s.total_amount)::float AS total_sale
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN customer_groups g ON g.id = c.customer_group_id
      WHERE s.business_id = ${bizId}::uuid
        AND s.status IN ('completed', 'refunded', 'partially_refunded')
        AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
        AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      GROUP BY g.id, g.name
      ORDER BY total_sale DESC
    `;
    const out = rows.map(r => ({ name: r.name, total_sale: plRound(plNum(r.total_sale)) }));
    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      rows: out,
      totals: { total_sale: plRound(out.reduce((s, r) => s + r.total_sale, 0)), count: out.length },
    });
  } catch (err) { next(err); }
});

module.exports = router;
