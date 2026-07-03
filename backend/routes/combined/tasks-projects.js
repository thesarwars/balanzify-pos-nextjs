const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
  ExpenseSchema, ExpenseCategorySchema,
  PaymentAccountSchema, AccountTransferSchema, AccountDepositSchema,
  CustomerGroupSchema, UnitSchema, BrandSchema, VariationTemplateSchema, DiscountSchema,
  PriceGroupSchema, InvoiceLayoutSchema, InvoiceSchemeSchema, CommissionSettingsSchema,
  ServiceTypeSchema,
} = require('../../validation/schemas');
const { trackLogin } = require('../../lib/metrics');

// ── TASKS ────────────────────────────────────────────────────────────────────
const tasksRouter = express.Router();

tasksRouter.get('/', auth, async (req, res, next) => {
  try {
    const { status, assignee_id, project_id, priority } = req.query;
    const tasks = await prisma.task.findMany({
      where: {
        businessId: req.user.business_id,
        ...(status && { status }), ...(assignee_id && { assigneeId: assignee_id }),
        ...(project_id && { projectId: project_id }), ...(priority && { priority }),
      },
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
    });
    res.json({ tasks });
  } catch (err) { next(err); }
});

tasksRouter.post('/', auth, validate(TaskSchema), async (req, res, next) => {
  try {
    const task = await prisma.task.create({ data: { businessId: req.user.business_id, ...mapTask(req.body), createdById: req.user.id } });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

tasksRouter.put('/:id', auth, validate(TaskSchema.partial()), async (req, res, next) => {
  try {
    const data = mapTask(req.body);
    if (req.body.status === 'completed') data.completedDate = new Date();
    const task = await prisma.task.update({ where: { id: req.params.id }, data });
    res.json(task);
  } catch (err) { next(err); }
});

tasksRouter.post('/:id/comments', auth, validate(CommentSchema), async (req, res, next) => {
  try {
    const comment = await prisma.taskComment.create({ data: { taskId: req.params.id, userId: req.user.id, comment: req.body.comment } });
    res.status(201).json(comment);
  } catch (err) { next(err); }
});

function mapTask(b) {
  return {
    title: b.title, description: b.description, category: b.category, priority: b.priority,
    status: b.status, assigneeId: b.assignee_id || null, dueDate: b.due_date ? new Date(b.due_date) : null,
    projectId: b.project_id || null, milestoneId: b.milestone_id || null,
    blockedReason: b.blocked_reason || null, isRecurring: b.is_recurring || false,
    recurrence: b.recurrence || null, notes: b.notes,
  };
}

// ── PROJECTS ─────────────────────────────────────────────────────────────────
const projectsRouter = express.Router();

projectsRouter.get('/', auth, async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { businessId: req.user.business_id },
      include: {
        owner: { select: { name: true } },
        _count: { select: { tasks: true, milestones: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ projects });
  } catch (err) { next(err); }
});

projectsRouter.post('/', auth, validate(ProjectSchema), async (req, res, next) => {
  try {
    const project = await prisma.project.create({ data: { businessId: req.user.business_id, ...mapProject(req.body), createdById: req.user.id } });
    res.status(201).json(project);
  } catch (err) { next(err); }
});

projectsRouter.put('/:id', auth, validate(ProjectSchema.partial()), async (req, res, next) => {
  try {
    const project = await prisma.project.update({ where: { id: req.params.id }, data: mapProject(req.body) });
    res.json(project);
  } catch (err) { next(err); }
});

projectsRouter.post('/:id/milestones', auth, validate(MilestoneSchema), async (req, res, next) => {
  try {
    const milestone = await prisma.milestone.create({ data: { projectId: req.params.id, ...mapMilestone(req.body) } });
    res.status(201).json(milestone);
  } catch (err) { next(err); }
});

function mapProject(b) {
  return {
    name: b.name, description: b.description, category: b.category, status: b.status,
    ownerId: b.owner_id || null, startDate: b.start_date ? new Date(b.start_date) : null,
    targetDate: b.target_date ? new Date(b.target_date) : null, budget: b.budget || 0, notes: b.notes,
  };
}
function mapMilestone(b) {
  return { name: b.name, description: b.description, ownerId: b.owner_id || null, dueDate: b.due_date ? new Date(b.due_date) : null, status: b.status, orderIndex: b.order_index || 0 };
}


module.exports = { tasksRouter, projectsRouter };
