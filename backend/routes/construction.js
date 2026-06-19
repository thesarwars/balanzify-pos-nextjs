/**
 * Construction Routes — Balanzify Construction module.
 * The contractor's loop, built for East African / diaspora-funded practice:
 * budget the job by category → log daily cash labor → keep a site diary with
 * photos (the remote diaspora owner's window into their build) → bill the
 * client by stage with retention → watch budget-vs-actual live so the job
 * never quietly loses money. Cost control is the killer feature, exactly as
 * expiry-loss prevention was for pharmacy.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const uuid = z.string().uuid();

// Guard: project must belong to this business
const ownProject = async (req, res) => {
  const p = await prisma.project.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
  if (!p) { res.status(404).json({ title: 'Project not found', status: 404 }); return null; }
  return p;
};

// ── Job cost dashboard: budget vs actual by category ────────────────
router.get('/:id/costing', auth, async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const [lines, labor] = await Promise.all([
      prisma.projectBudgetLine.findMany({ where: { projectId: project.id } }),
      prisma.laborEntry.aggregate({ where: { projectId: project.id }, _sum: { total: true } }),
    ]);
    const laborActual = parseFloat(labor._sum.total || 0);
    const enriched = lines.map(l => ({
      ...l,
      actual: l.category === 'labor' ? +(parseFloat(l.actual) + laborActual).toFixed(2) : parseFloat(l.actual),
      variance: +(parseFloat(l.budgeted) - (l.category === 'labor' ? parseFloat(l.actual) + laborActual : parseFloat(l.actual))).toFixed(2),
    }));
    const totalBudget = enriched.reduce((s, l) => s + parseFloat(l.budgeted), 0);
    const totalActual = enriched.reduce((s, l) => s + l.actual, 0);
    res.json({
      project: { id: project.id, name: project.name, status: project.status },
      lines: enriched,
      totals: {
        budgeted: +totalBudget.toFixed(2),
        actual: +totalActual.toFixed(2),
        remaining: +(totalBudget - totalActual).toFixed(2),
        over_budget: totalActual > totalBudget,
      },
    });
  } catch (err) { next(err); }
});

// Budget lines
router.post('/:id/budget-lines', auth, requireRole('owner', 'manager'), validate(z.object({
  category: z.enum(['materials', 'labor', 'subcontract', 'equipment', 'other']),
  description: z.string().max(255).optional(),
  budgeted: z.coerce.number().nonnegative(),
})), async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    res.status(201).json(await prisma.projectBudgetLine.create({ data: { projectId: project.id, ...req.body } }));
  } catch (err) { next(err); }
});

// Record actual cost against a line (material purchase, subcontract payment…)
router.post('/budget-lines/:lineId/cost', auth, validate(z.object({
  amount: z.coerce.number().positive(),
})), async (req, res, next) => {
  try {
    const line = await prisma.projectBudgetLine.findFirst({
      where: { id: req.params.lineId, project: { businessId: req.user.business_id } },
    });
    if (!line) return res.status(404).json({ title: 'Budget line not found', status: 404 });
    const updated = await prisma.projectBudgetLine.update({
      where: { id: line.id },
      data: { actual: { increment: req.body.amount } },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Edit a budget line (re-budget / rename)
router.put('/budget-lines/:lineId', auth, requireRole('owner', 'manager'), validate(z.object({
  description: z.string().max(255).optional().nullable(),
  budgeted: z.coerce.number().nonnegative().optional(),
})), async (req, res, next) => {
  try {
    const line = await prisma.projectBudgetLine.findFirst({
      where: { id: req.params.lineId, project: { businessId: req.user.business_id } },
    });
    if (!line) return res.status(404).json({ title: 'Budget line not found', status: 404 });
    const updated = await prisma.projectBudgetLine.update({
      where: { id: line.id },
      data: {
        ...(req.body.description !== undefined && { description: req.body.description }),
        ...(req.body.budgeted !== undefined && { budgeted: req.body.budgeted }),
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// Remove a budget line
router.delete('/budget-lines/:lineId', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const line = await prisma.projectBudgetLine.findFirst({
      where: { id: req.params.lineId, project: { businessId: req.user.business_id } },
    });
    if (!line) return res.status(404).json({ title: 'Budget line not found', status: 404 });
    await prisma.projectBudgetLine.delete({ where: { id: line.id } });
    res.json({ message: 'Budget line removed.' });
  } catch (err) { next(err); }
});

// ── Daily labor log (cash daily-rate labor — the regional norm) ─────
router.post('/:id/labor', auth, validate(z.object({
  work_date: z.string(),
  workers: z.coerce.number().int().positive(),
  daily_rate: z.coerce.number().positive(),
  notes: z.string().max(255).optional(),
})), async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const total = +(req.body.workers * req.body.daily_rate).toFixed(2);
    const entry = await prisma.laborEntry.create({
      data: { projectId: project.id, workDate: new Date(req.body.work_date), workers: req.body.workers, dailyRate: req.body.daily_rate, total, notes: req.body.notes },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

router.get('/:id/labor', auth, async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const entries = await prisma.laborEntry.findMany({ where: { projectId: project.id }, orderBy: { workDate: 'desc' }, take: 100 });
    res.json({ entries, total: +entries.reduce((s, e) => s + parseFloat(e.total), 0).toFixed(2) });
  } catch (err) { next(err); }
});

// ── Site diary with photos — the diaspora owner's window ────────────
router.post('/:id/site-log', auth, validate(z.object({
  log_date: z.string(),
  notes: z.string().min(1),
  photo_urls: z.array(z.string().url()).max(20).optional(),
})), async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const log = await prisma.siteLog.create({
      data: { projectId: project.id, logDate: new Date(req.body.log_date), notes: req.body.notes, photoUrls: req.body.photo_urls || [], loggedById: req.user.id },
    });
    res.status(201).json(log);
  } catch (err) { next(err); }
});

router.get('/:id/site-log', auth, async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    res.json({ logs: await prisma.siteLog.findMany({ where: { projectId: project.id }, orderBy: { logDate: 'desc' }, take: 60 }) });
  } catch (err) { next(err); }
});

// ── Milestones & stage billing with retention ───────────────────────
router.post('/:id/milestones', auth, requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1).max(255),
  amount: z.coerce.number().nonnegative(),
  retention_pct: z.coerce.number().min(0).max(50).default(0),
  sort_order: z.coerce.number().int().default(0),
})), async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    res.status(201).json(await prisma.projectMilestone.create({
      data: { projectId: project.id, name: req.body.name, amount: req.body.amount, retentionPct: req.body.retention_pct, sortOrder: req.body.sort_order },
    }));
  } catch (err) { next(err); }
});

router.get('/:id/milestones', auth, async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const ms = await prisma.projectMilestone.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
    res.json({
      milestones: ms.map(m => ({
        ...m,
        billable_now: m.status === 'complete' ? +(parseFloat(m.amount) * (1 - parseFloat(m.retentionPct) / 100)).toFixed(2) : null,
        retention_held: +(parseFloat(m.amount) * parseFloat(m.retentionPct) / 100).toFixed(2),
      })),
    });
  } catch (err) { next(err); }
});

// Advance milestone status: pending → in_progress → complete → billed → paid
router.put('/milestones/:msId/status', auth, validate(z.object({
  status: z.enum(['pending', 'in_progress', 'complete', 'billed', 'paid']),
})), async (req, res, next) => {
  try {
    const ms = await prisma.projectMilestone.findFirst({
      where: { id: req.params.msId, project: { businessId: req.user.business_id } },
    });
    if (!ms) return res.status(404).json({ title: 'Milestone not found', status: 404 });
    const stamps = {};
    if (req.body.status === 'complete') stamps.completedAt = new Date();
    if (req.body.status === 'billed') stamps.billedAt = new Date();
    res.json(await prisma.projectMilestone.update({ where: { id: ms.id }, data: { status: req.body.status, ...stamps } }));
  } catch (err) { next(err); }
});

module.exports = router;
