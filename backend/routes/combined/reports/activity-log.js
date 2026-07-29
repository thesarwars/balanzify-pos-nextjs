// Activity Log: who did what and when, from the activity_log table.
// The Subject Type list is data-driven — only the entity types this business
// has actually produced get offered as a filter.
const express = require('express');
const prisma = require('../../../lib/prisma');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_UUID_RE, plRange } = require('./_shared');

const router = express.Router();

// A short human phrase for the note column, built from the details JSON without
// dumping raw internals at the reader.
function noteOf(action, details) {
  if (!details || typeof details !== 'object') return '';
  const parts = [];
  if (details.ip) parts.push(`IP ${details.ip}`);
  if (details.key) parts.push(`token ${String(details.key).slice(0, 12)}…`);
  for (const [k, v] of Object.entries(details)) {
    if (k === 'ip' || k === 'key') continue;
    if (v == null || typeof v === 'object') continue;
    parts.push(`${k.replace(/_/g, ' ')}: ${v}`);
  }
  return parts.join(' · ');
}

const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

router.get('/activity-log', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd } = range;

    const user = req.query.user_id || null;
    if (user && !(typeof user === 'string' && PL_UUID_RE.test(user))) {
      return res.status(400).json({ title: 'user_id must be a UUID.', status: 400 });
    }
    const subject = typeof req.query.subject_type === 'string' && req.query.subject_type
      ? req.query.subject_type : null;

    const where = {
      businessId: bizId,
      createdAt: { gte: fromDate, lt: toEnd },
      ...(user && { userId: user }),
      ...(subject && { entityType: subject }),
    };

    const [logs, subjects] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        select: {
          id: true, createdAt: true, action: true, entityType: true, entityId: true, details: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      // Every subject type this business has produced, for the filter.
      prisma.activityLog.groupBy({
        by: ['entityType'],
        where: { businessId: bizId },
      }),
    ]);

    const rows = logs.map(l => ({
      id: l.id,
      date: l.createdAt,
      subject_type: l.entityType ? titleCase(l.entityType) : '',
      subject_type_key: l.entityType || '',
      action: titleCase(l.action),
      by: l.user?.name || '',
      by_email: l.user?.email || '',
      note: noteOf(l.action, l.details),
    }));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      user_id: user, subject_type: subject,
      subject_types: subjects.map(s => s.entityType).filter(Boolean).sort(),
      rows,
      totals: { count: rows.length },
      limited: logs.length === 5000,
    });
  } catch (err) { next(err); }
});

module.exports = router;
