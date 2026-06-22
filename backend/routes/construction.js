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
const accounting = require('../lib/accounting');
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
    // Daily-labor entries roll into the labor category exactly ONCE. The old code
    // added them to every labor budget line, so two labor lines double-counted the
    // wage bill; and with no labor line the wages vanished from the totals.
    let laborApplied = false;
    const enriched = lines.map(l => {
      let actual = parseFloat(l.actual);
      if (l.category === 'labor' && !laborApplied) { actual = +(actual + laborActual).toFixed(2); laborApplied = true; }
      return { ...l, actual, variance: +(parseFloat(l.budgeted) - actual).toFixed(2) };
    });
    // Labor was logged but never budgeted — surface it so it isn't lost from totals.
    if (!laborApplied && laborActual > 0) {
      enriched.push({ id: null, projectId: project.id, category: 'labor', description: 'Daily labor (unbudgeted)', budgeted: 0, actual: laborActual, variance: -laborActual });
    }
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

// Advance milestone status: pending → in_progress → complete → billed → paid.
// Billing raises a real receivable against revenue (retention held aside); paying
// collects the net into the chosen account. Both post to the GL idempotently.
router.put('/milestones/:msId/status', auth, validate(z.object({
  status: z.enum(['pending', 'in_progress', 'complete', 'billed', 'paid']),
  method: z.string().max(30).optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const ms = await prisma.projectMilestone.findFirst({
      where: { id: req.params.msId, project: { businessId } },
    });
    if (!ms) return res.status(404).json({ title: 'Milestone not found', status: 404 });

    const next_ = req.body.status;
    const total = parseFloat(ms.amount);
    const retention = +(total * parseFloat(ms.retentionPct) / 100).toFixed(2);
    const net = +(total - retention).toFixed(2);

    // A milestone can only be billed once it's actually complete.
    if (next_ === 'billed' && ms.status !== 'complete' && !ms.completedAt) {
      return res.status(422).json({ title: 'Milestone must be complete before billing', status: 422 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const stamps = {};
      if (next_ === 'complete') stamps.completedAt = ms.completedAt || new Date();

      // Raise the receivable on first billing (or implicitly when jumping to paid).
      const needsBill = (next_ === 'billed' || next_ === 'paid') && !ms.billedAt;
      if (needsBill) {
        stamps.billedAt = new Date();
        if (total > 0) {
          await accounting.postMilestoneBill(tx, {
            businessId, amount: total, retention, sourceId: ms.id,
            createdById: req.user.id, description: `Milestone: ${ms.name}`,
          });
        }
      }

      // Collect the net (retention stays receivable) — once.
      if (next_ === 'paid' && net > 0) {
        const paid = await tx.journalEntry.findFirst({ where: { businessId, sourceType: 'milestone_payment', sourceId: ms.id } });
        if (!paid) {
          await accounting.postMilestonePayment(tx, { businessId, method: req.body.method || 'cash', amount: net, sourceId: ms.id, createdById: req.user.id });
        }
      }

      return tx.projectMilestone.update({ where: { id: ms.id }, data: { status: next_, ...stamps } });
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── Change orders / variations ──────────────────────────────────────
const coNum  = () => `CO-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 99)}`;
const reqNum = () => `REQ-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 99)}`;

// Raise a variation against the contract.
router.post('/:id/change-orders', auth, requireRole('owner', 'manager'), validate(z.object({
  description: z.string().min(1).max(500),
  category: z.enum(['materials', 'labor', 'subcontract', 'equipment', 'other']).default('other'),
  cost_impact: z.coerce.number().default(0),   // +/- to the job's budgeted cost
  price_impact: z.coerce.number().default(0),  // +/- billed to the client
})), async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const co = await prisma.changeOrder.create({
      data: {
        projectId: project.id, coNumber: coNum(), description: req.body.description,
        category: req.body.category, costImpact: req.body.cost_impact, priceImpact: req.body.price_impact,
        createdById: req.user.id,
      },
    });
    res.status(201).json(co);
  } catch (err) { next(err); }
});

// List variations + revised-contract summary.
router.get('/:id/change-orders', auth, async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const cos = await prisma.changeOrder.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } });
    const approved = cos.filter(c => c.status === 'approved');
    const sum = (arr, k) => +arr.reduce((s, c) => s + parseFloat(c[k]), 0).toFixed(2);
    res.json({
      change_orders: cos,
      summary: {
        approved_cost_impact:  sum(approved, 'costImpact'),
        approved_price_impact: sum(approved, 'priceImpact'),
        pending_count: cos.filter(c => c.status === 'pending').length,
      },
    });
  } catch (err) { next(err); }
});

// Approve or reject a variation. Approval moves the budget (a new budget line) and,
// when it changes the contract price, raises a billable milestone — so the variation
// flows through the existing stage-billing/GL path. Idempotent on the pending→ edge.
router.put('/change-orders/:coId/status', auth, requireRole('owner', 'manager'), validate(z.object({
  status: z.enum(['approved', 'rejected']),
})), async (req, res, next) => {
  try {
    const co = await prisma.changeOrder.findFirst({
      where: { id: req.params.coId, project: { businessId: req.user.business_id } },
    });
    if (!co) return res.status(404).json({ title: 'Change order not found', status: 404 });
    if (co.status !== 'pending') return res.status(422).json({ title: `Change order already ${co.status}`, status: 422 });

    if (req.body.status === 'rejected') {
      const updated = await prisma.changeOrder.update({ where: { id: co.id }, data: { status: 'rejected' } });
      return res.json(updated);
    }

    const cost = parseFloat(co.costImpact);
    const price = parseFloat(co.priceImpact);
    const updated = await prisma.$transaction(async (tx) => {
      // Revise the budget: the variation's cost becomes a budget line of its own.
      if (cost !== 0) {
        await tx.projectBudgetLine.create({
          data: { projectId: co.projectId, category: co.category, description: `${co.coNumber}: ${co.description}`.slice(0, 255), budgeted: cost },
        });
        await tx.project.update({ where: { id: co.projectId }, data: { budget: { increment: cost } } });
      }
      // Make the variation billable to the client via a milestone.
      let milestoneId = null;
      if (price !== 0) {
        const ms = await tx.projectMilestone.create({
          data: { projectId: co.projectId, name: `${co.coNumber}: ${co.description}`.slice(0, 255), amount: price, status: 'pending' },
        });
        milestoneId = ms.id;
      }
      return tx.changeOrder.update({ where: { id: co.id }, data: { status: 'approved', approvedAt: new Date(), milestoneId } });
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── Material requisitions: issue stock from inventory to the job ─────
// Relieves inventory at FIFO cost (falls back to standard cost), books the cost
// to COGS against inventory, and rolls into the project's material actuals.
router.post('/:id/requisitions', auth, requireRole('owner', 'manager'), validate(z.object({
  location_id: uuid,
  notes: z.string().max(500).optional(),
  items: z.array(z.object({ product_id: uuid, quantity: z.coerce.number().int().positive() })).min(1),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const project = await ownProject(req, res); if (!project) return;

    const loc = await prisma.location.findFirst({ where: { id: req.body.location_id, businessId } });
    if (!loc) return res.status(400).json({ title: 'Unknown location', status: 400 });

    const prods = await prisma.product.findMany({
      where: { id: { in: req.body.items.map(i => i.product_id) }, businessId },
      select: { id: true, name: true, costPrice: true },
    });
    if (prods.length !== req.body.items.length) return res.status(400).json({ title: 'Unknown product in requisition', status: 400 });
    const byId = Object.fromEntries(prods.map(p => [p.id, p]));

    try {
      const result = await prisma.$transaction(async (tx) => {
        const lineRecords = [];
        let totalCost = 0;
        for (const it of req.body.items) {
          // Stock must be on hand at this location.
          const level = await tx.stockLevel.findFirst({ where: { productId: it.product_id, locationId: loc.id } });
          const onHand = level?.quantity || 0;
          if (onHand < it.quantity) {
            throw Object.assign(new Error(`Insufficient stock for ${byId[it.product_id].name}. On hand: ${onHand}`), { statusCode: 400 });
          }

          // FIFO cost: consume oldest cost layers; fall back to standard cost.
          let remaining = it.quantity, costAccrued = 0, consumed = 0;
          const layers = await tx.costLayer.findMany({
            where: { businessId, productId: it.product_id, quantityRemaining: { gt: 0 }, OR: [{ locationId: loc.id }, { locationId: null }] },
            orderBy: { receivedAt: 'asc' },
          });
          for (const layer of layers) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, layer.quantityRemaining);
            costAccrued += take * parseFloat(layer.unitCost);
            consumed += take;
            await tx.costLayer.update({ where: { id: layer.id }, data: { quantityRemaining: layer.quantityRemaining - take } });
            remaining -= take;
          }
          const stdCost = parseFloat(byId[it.product_id].costPrice);
          // Whatever FIFO couldn't cover values at standard cost.
          if (remaining > 0) costAccrued += remaining * stdCost;
          const unitCost = it.quantity > 0 ? +(costAccrued / it.quantity).toFixed(2) : 0;
          const lineCost = +costAccrued.toFixed(2);
          totalCost += lineCost;

          // Relieve stock + movement trail.
          const newQty = onHand - it.quantity;
          await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: newQty } });
          await tx.stockMovement.create({
            data: {
              businessId, productId: it.product_id, locationId: loc.id, type: 'out',
              quantity: -it.quantity, balanceAfter: newQty,
              referenceType: 'material_requisition', notes: `Issued to project ${project.name}`.slice(0, 255),
              createdById: req.user.id,
            },
          });
          lineRecords.push({ productId: it.product_id, locationId: loc.id, quantity: it.quantity, unitCost, lineCost });
        }
        totalCost = +totalCost.toFixed(2);

        const requisition = await tx.materialRequisition.create({
          data: {
            projectId: project.id, reqNumber: reqNum(), totalCost, notes: req.body.notes,
            issuedById: req.user.id, items: { create: lineRecords },
          },
          include: { items: true },
        });

        // GL: stock issued to a job is a cost — relieve inventory into COGS.
        if (totalCost > 0) {
          await accounting.postJournal(tx, {
            businessId, description: `Materials to project — ${project.name}`.slice(0, 255),
            sourceType: 'material_requisition', sourceId: requisition.id, createdById: req.user.id,
            lines: [
              { code: '5000', debit: totalCost, credit: 0, description: 'Project materials cost' },
              { code: '1200', debit: 0, credit: totalCost, description: 'Inventory relief' },
            ],
          });
        }

        // Roll into job cost: bump the materials budget line actual (create if absent).
        let matLine = await tx.projectBudgetLine.findFirst({ where: { projectId: project.id, category: 'materials' } });
        if (!matLine) matLine = await tx.projectBudgetLine.create({ data: { projectId: project.id, category: 'materials', description: 'Materials (issued from stock)', budgeted: 0 } });
        await tx.projectBudgetLine.update({ where: { id: matLine.id }, data: { actual: { increment: totalCost } } });
        await tx.project.update({ where: { id: project.id }, data: { spent: { increment: totalCost } } });

        return requisition;
      });
      res.status(201).json(result);
    } catch (e) {
      if (e.statusCode === 400) return res.status(400).json({ title: e.message, status: 400 });
      throw e;
    }
  } catch (err) { next(err); }
});

// List requisitions issued to a project.
router.get('/:id/requisitions', auth, async (req, res, next) => {
  try {
    const project = await ownProject(req, res); if (!project) return;
    const reqs = await prisma.materialRequisition.findMany({
      where: { projectId: project.id }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ requisitions: reqs, total_cost: +reqs.reduce((s, r) => s + parseFloat(r.totalCost), 0).toFixed(2) });
  } catch (err) { next(err); }
});

module.exports = router;
