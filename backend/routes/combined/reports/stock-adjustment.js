// Stock Adjustment report: normal / abnormal / recovered totals and the
// adjustment-document list for a location + date range.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { plNum, plRound, plRange } = require('./_shared');

const router = express.Router();

router.get('/stock-adjustment', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const docs = await prisma.stockAdjustmentDoc.findMany({
      where: {
        businessId: bizId,
        // adjustment_date defaults to now() but can be back-dated; fall back to
        // created_at only when it is somehow null.
        OR: [
          { adjustmentDate: { gte: fromDate, lt: toEnd } },
          { adjustmentDate: null, createdAt: { gte: fromDate, lt: toEnd } },
        ],
        ...(loc && { locationId: loc }),
      },
      select: {
        id: true, referenceNo: true, type: true, adjustmentDate: true, createdAt: true,
        totalAmount: true, totalRecovered: true, reason: true,
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ adjustmentDate: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
    });

    const rows = docs.map(d => ({
      id: d.id,
      date: d.adjustmentDate || d.createdAt,
      ref: d.referenceNo || String(d.id).slice(0, 8),
      location: d.location?.name || '',
      type: d.type, // normal | abnormal
      total_amount: plRound(plNum(d.totalAmount)),
      total_recovered: plRound(plNum(d.totalRecovered)),
      reason: d.reason || '',
      added_by: d.createdBy?.name || '',
    }));

    const sumWhere = (t) => plRound(rows.filter(r => r.type === t).reduce((s, r) => s + r.total_amount, 0));
    const totalAmount = plRound(rows.reduce((s, r) => s + r.total_amount, 0));
    const totalRecovered = plRound(rows.reduce((s, r) => s + r.total_recovered, 0));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      rows,
      summary: {
        total_normal: sumWhere('normal'),
        total_abnormal: sumWhere('abnormal'),
        total_adjustment: totalAmount,
        total_recovered: totalRecovered,
      },
      limited: docs.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
