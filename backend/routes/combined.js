const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
} = require('../validation/schemas');
const { trackLogin } = require('../lib/metrics');

// ── SUPPLIERS ────────────────────────────────────────────────────────────────
const suppliersRouter = express.Router();

suppliersRouter.get('/', auth, async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { _count: { select: { purchaseOrders: true, products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ suppliers });
  } catch (err) { next(err); }
});

suppliersRouter.post('/', auth, requireRole('owner', 'manager'), validate(SupplierSchema), async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.create({
      data: { businessId: req.user.business_id, ...mapSupplier(req.body) },
    });
    res.status(201).json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(SupplierSchema.partial()), async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: mapSupplier(req.body),
    });
    res.json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        products: { include: { product: { select: { name: true, sku: true } } } },
        communications: { orderBy: { createdAt: 'desc' }, take: 20 },
        purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!supplier || supplier.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(supplier);
  } catch (err) { next(err); }
});

suppliersRouter.post('/:id/communications', auth, validate(SupplierCommSchema), async (req, res, next) => {
  try {
    const comm = await prisma.supplierCommunication.create({
      data: { supplierId: req.params.id, ...req.body, createdById: req.user.id },
    });
    res.status(201).json(comm);
  } catch (err) { next(err); }
});

suppliersRouter.post('/:id/products', auth, requireRole('owner', 'manager'), validate(SupplierProductSchema), async (req, res, next) => {
  try {
    const sp = await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: req.params.id, productId: req.body.product_id } },
      create: { supplierId: req.params.id, productId: req.body.product_id, supplierSku: req.body.supplier_sku, unitPrice: req.body.unit_price, minOrderQty: req.body.min_order_qty || 1, leadTimeDays: req.body.lead_time_days || 0, isPreferred: req.body.is_preferred || false },
      update: { supplierSku: req.body.supplier_sku, unitPrice: req.body.unit_price, minOrderQty: req.body.min_order_qty || 1, leadTimeDays: req.body.lead_time_days || 0, isPreferred: req.body.is_preferred || false },
    });
    res.status(201).json(sp);
  } catch (err) { next(err); }
});

// Maps only the keys present in the request body so partial updates (PUT) don't
// reset untouched columns to their defaults. Prisma ignores undefined values.
function mapSupplier(b) {
  const m = {};
  if (b.name           !== undefined) m.name = b.name;
  if (b.contact_person !== undefined) m.contactPerson = b.contact_person;
  if (b.phone          !== undefined) m.phone = b.phone;
  if (b.whatsapp       !== undefined) m.whatsapp = b.whatsapp;
  if (b.email          !== undefined) m.email = b.email;
  if (b.country        !== undefined) m.country = b.country;
  if (b.city           !== undefined) m.city = b.city;
  if (b.address        !== undefined) m.address = b.address;
  if (b.payment_terms  !== undefined) m.paymentTerms = b.payment_terms;
  if (b.credit_limit   !== undefined) m.creditLimit = b.credit_limit;
  if (b.currency       !== undefined) m.currency = b.currency;
  if (b.rating         !== undefined) m.rating = b.rating;
  if (b.is_blacklisted !== undefined) m.isBlacklisted = b.is_blacklisted;
  if (b.blacklist_reason !== undefined) m.blacklistReason = b.blacklist_reason;
  if (b.is_active      !== undefined) m.isActive = b.is_active;
  if (b.notes          !== undefined) m.notes = b.notes;
  return m;
}

// ── STOCK (adjustments, transfers) ───────────────────────────────────────────
const stockRouter = express.Router();

stockRouter.post('/adjustments', auth, validate(AdjustmentSchema), async (req, res, next) => {
  try {
    const { product_id, location_id, type, quantity, reason, photo_url } = req.body;
    const adj = await prisma.stockAdjustment.create({
      data: {
        businessId: req.user.business_id, productId: product_id, locationId: location_id,
        type, quantity, reason, photoUrl: photo_url, createdById: req.user.id,
      },
    });
    res.status(201).json(adj);
  } catch (err) { next(err); }
});
stockRouter.get('/adjustments', auth, async (req, res, next) => {
  try {
    // Fetches all adjustments tied to the logged-in user's business
    const adjustments = await prisma.stockAdjustment.findMany({
      where: {
        businessId: req.user.business_id,
      },
      orderBy: {
        createdAt: 'desc', // Optional: Brings newest adjustments to the top
      },
    });
    
    res.status(200).json(adjustments);
  } catch (error) { 
    next(error); 
  }
});

stockRouter.post('/adjustments/:id/approve', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const adj = await prisma.stockAdjustment.findUnique({ where: { id: req.params.id } });
    if (!adj || adj.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (adj.status !== 'pending') return res.status(400).json({ title: 'Already processed', status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO stock_levels (id, product_id, location_id, quantity)
        VALUES (gen_random_uuid(), ${adj.productId}::uuid, ${adj.locationId}::uuid, ${adj.quantity})
        ON CONFLICT (product_id, location_id) DO UPDATE
        SET quantity = GREATEST(0, stock_levels.quantity + ${adj.quantity}), updated_at = NOW()
      `;
      await tx.stockMovement.create({
        data: {
          businessId: req.user.business_id, productId: adj.productId, locationId: adj.locationId,
          type: 'adjustment', quantity: adj.quantity, referenceId: adj.id, referenceType: 'adjustment',
          notes: adj.reason, createdById: req.user.id,
        },
      });
      await tx.stockAdjustment.update({
        where: { id: req.params.id },
        data: { status: 'approved', approvedById: req.user.id, approvedAt: new Date() },
      });
    });
    res.json({ message: 'Adjustment approved.' });
  } catch (err) { next(err); }
});

stockRouter.post('/transfers', auth, validate(TransferSchema), async (req, res, next) => {
  try {
    const { from_location_id, to_location_id, items, notes } = req.body;
    
    const transfer = await prisma.$transaction(async (tx) => {
      const t = await tx.stockTransfer.create({
        data: {
          businessId: req.user.business_id,
          transferNumber: `TRF-${Date.now()}`,
          fromLocationId: from_location_id, 
          toLocationId: to_location_id,
          notes, 
          status: 'received', 
          createdById: req.user.id,
          items: { 
            create: items.map(i => ({ 
              productId: i.product_id, 
              requestedQty: i.qty, 
              dispatchedQty: i.qty, 
              receivedQty: i.qty 
            })) 
          },
        },
      });

      // Loop through each item using only the exact columns present in stock_levels
      for (const item of items) {
        // Deduct quantity from source location
        await tx.$executeRaw`
          INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) 
          VALUES (
            gen_random_uuid(), 
            ${item.product_id}::uuid, 
            ${from_location_id}::uuid, 
            0, 
            NOW()
          )
          ON CONFLICT (product_id, location_id) 
          DO UPDATE SET 
            quantity = GREATEST(0, stock_levels.quantity - ${item.qty}), 
            updated_at = NOW()
        `;

        // Add quantity to destination location
        await tx.$executeRaw`
          INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) 
          VALUES (
            gen_random_uuid(), 
            ${item.product_id}::uuid, 
            ${to_location_id}::uuid, 
            ${item.qty}, 
            NOW()
          )
          ON CONFLICT (product_id, location_id) 
          DO UPDATE SET 
            quantity = stock_levels.quantity + ${item.qty}, 
            updated_at = NOW()
        `;
      }
      
      return t;
    });

    res.status(201).json(transfer);
  } catch (err) { 
    next(err); 
  }
});
// ======= GET ALL TRANSFERS =======
stockRouter.get('/transfers', auth, async (req, res, next) => {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      where: { businessId: req.user.business_id },
      include: {
        fromLocation: true,
        toLocation: true,
        items: {
          include: { product: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(transfers);
  } catch (err) { next(err); }
});

// ======= GET ONE TRANSFER =======
stockRouter.get('/transfers/:id', auth, async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: {
        id: req.params.id,
        businessId: req.user.business_id
      },
      include: {
        fromLocation: true,
        toLocation: true,
        items: {
          include: { product: true }
        }
      }
    });

    if (!transfer) return res.status(404).json({ error: "Transfer records not found" });
    res.status(200).json(transfer);
  } catch (err) { next(err); }
});

// ======= UPDATE TRANSFER (Reconciles quantities dynamically) =======
stockRouter.put('/transfers/:id', auth, validate(TransferSchema), async (req, res, next) => {
  try {
    const { from_location_id, to_location_id, items, notes } = req.body;
    const transferId = req.params.id;

    const updatedTransfer = await prisma.$transaction(async (tx) => {
      // 1. Fetch current transfer items to reverse stock effects first
      const existingTransfer = await tx.stockTransfer.findFirst({
        where: { id: transferId, businessId: req.user.business_id },
        include: { items: true }
      });
      if (!existingTransfer) throw new Error("Transfer not found");

      // 2. Reverse previous inventory adjustments
      for (const item of existingTransfer.items) {
        await tx.$executeRaw`
          UPDATE stock_levels SET quantity = quantity + ${item.dispatchedQty} 
          WHERE product_id = ${item.productId}::uuid AND location_id = ${existingTransfer.fromLocationId}::uuid`;
        await tx.$executeRaw`
          UPDATE stock_levels SET quantity = GREATEST(0, quantity - ${item.receivedQty}) 
          WHERE product_id = ${item.productId}::uuid AND location_id = ${existingTransfer.toLocationId}::uuid`;
      }

      // 3. Clear old nested transfer items
      await tx.stockTransferItem.deleteMany({ where: { transferId } });

      // 4. Update the transfer record metadata and build new items
      const updated = await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          fromLocationId: from_location_id,
          toLocationId: to_location_id,
          notes,
          items: {
            create: items.map(i => ({
              productId: i.product_id,
              requestedQty: i.qty,
              dispatchedQty: i.qty,
              receivedQty: i.qty
            }))
          }
        }
      });

      // 5. Apply the updated item quantities into inventory locations
      for (const item of items) {
        await tx.$executeRaw`
          INSERT INTO stock_levels (id, product_id, location_id, quantity) VALUES (gen_random_uuid(), ${item.product_id}::uuid, ${from_location_id}::uuid, 0)
          ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = GREATEST(0, stock_levels.quantity - ${item.qty}), updated_at = NOW()`;
        await tx.$executeRaw`
          INSERT INTO stock_levels (id, product_id, location_id, quantity) VALUES (gen_random_uuid(), ${item.product_id}::uuid, ${to_location_id}::uuid, ${item.qty})
          ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock_levels.quantity + ${item.qty}, updated_at = NOW()`;
      }

      return updated;
    });

    res.status(200).json(updatedTransfer);
  } catch (err) { next(err); }
});

// ======= DELETE TRANSFER (Reverts inventory levels cleanly) =======
stockRouter.delete('/transfers/:id', auth, async (req, res, next) => {
  try {
    const transferId = req.params.id;

    await prisma.$transaction(async (tx) => {
      const existingTransfer = await tx.stockTransfer.findFirst({
        where: { id: transferId, businessId: req.user.business_id },
        include: { items: true }
      });
      if (!existingTransfer) throw new Error("Transfer records not found");

      // Reverse previous inventory levels changes
      for (const item of existingTransfer.items) {
        await tx.$executeRaw`
          UPDATE stock_levels SET quantity = quantity + ${item.dispatchedQty} 
          WHERE product_id = ${item.productId}::uuid AND location_id = ${existingTransfer.fromLocationId}::uuid`;
        await tx.$executeRaw`
          UPDATE stock_levels SET quantity = GREATEST(0, quantity - ${item.receivedQty}) 
          WHERE product_id = ${item.productId}::uuid AND location_id = ${existingTransfer.toLocationId}::uuid`;
      }

      // Drop cascading children records manually if schema constraints don't do it automatically
      await tx.stockTransferItem.deleteMany({ where: { transferId } });
      await tx.stockTransfer.delete({ where: { id: transferId } });
    });

    res.status(200).json({ success: true, message: "Transfer successfully deleted and inventory reverted" });
  } catch (err) { next(err); }
});

stockRouter.get('/levels', auth, async (req, res, next) => {
  try {
    const { location_id } = req.query;
    const levels = await prisma.stockLevel.findMany({
      where: {
        product: { businessId: req.user.business_id, isActive: true },
        ...(location_id && { locationId: location_id }),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, barcode: true, reorderPoint: true, sellingPrice: true, imageUrl: true } },
        location: { select: { name: true } },
      },
    });
    res.json({ levels });
  } catch (err) { next(err); }
});

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

// ── REPORTS ──────────────────────────────────────────────────────────────────
const reportsRouter = express.Router();

reportsRouter.get('/sales', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = {
      businessId: req.user.business_id, status: 'completed',
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
    };
    const [totals, byMethod, byDay] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { totalAmount: true, discountAmount: true }, _count: { id: true }, _avg: { totalAmount: true } }),
      prisma.sale.groupBy({ by: ['paymentMethod'], where, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count, SUM(total_amount) as revenue
        FROM sales WHERE business_id = ${req.user.business_id}::uuid AND status = 'completed'
        ${from ? `AND created_at >= '${from}'` : ''}
        GROUP BY DATE(created_at) ORDER BY date
      `,
    ]);
    res.json({ totals, by_method: byMethod, by_day: byDay });
  } catch (err) { next(err); }
});

reportsRouter.get('/inventory', auth, async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { stockLevels: true, category: { select: { name: true } } },
    });
    const report = products.map(p => {
      const stock = p.stockLevels.reduce((s, sl) => s + sl.quantity, 0);
      return { id: p.id, name: p.name, sku: p.sku, category: p.category?.name, stock, reorder_point: p.reorderPoint, cost_price: p.costPrice, selling_price: p.sellingPrice, stock_value: stock * parseFloat(p.costPrice), is_low_stock: stock <= p.reorderPoint && p.reorderPoint > 0 };
    });
    res.json({ products: report, total_value: report.reduce((s, p) => s + parseFloat(p.stock_value), 0) });
  } catch (err) { next(err); }
});

reportsRouter.get('/cashier', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { businessId: req.user.business_id, status: 'completed', ...(from && { createdAt: { gte: new Date(from) } }), ...(to && { createdAt: { lte: new Date(to) } }) };
    const report = await prisma.sale.groupBy({ by: ['cashierId'], where, _sum: { totalAmount: true }, _count: { id: true }, _avg: { totalAmount: true } });
    const cashiers = await prisma.user.findMany({ where: { id: { in: report.map(r => r.cashierId).filter(Boolean) } }, select: { id: true, name: true } });
    const cashierMap = Object.fromEntries(cashiers.map(c => [c.id, c.name]));
    res.json({ report: report.map(r => ({ cashier: cashierMap[r.cashierId] || 'Unknown', transactions: r._count.id, total: r._sum.totalAmount, avg: r._avg.totalAmount })) });
  } catch (err) { next(err); }
});

reportsRouter.get('/profit', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = {
      businessId: req.user.business_id,
      status: 'completed',
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to   && { createdAt: { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
    };

    // Revenue and discount totals
    const totals = await prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true, discountAmount: true, couponDiscount: true, loyaltyDiscount: true, tipAmount: true },
      _count: { id: true },
    });

    // COGS: sum of (cost_price * quantity) from sale_items joined to completed sales
    // Build date bounds for the raw query
    const fromDate = from ? new Date(from) : new Date('2000-01-01');
    const toDate   = to   ? new Date(new Date(to).setDate(new Date(to).getDate() + 1)) : new Date('2099-12-31');
    const cogsResult = await prisma.$queryRaw`
      SELECT COALESCE(SUM(si.cost_price * si.quantity), 0) AS cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.business_id = ${req.user.business_id}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
        AND s.created_at <= ${toDate}
    `;

    const revenue = parseFloat(totals._sum.totalAmount || 0);
    const cogs    = parseFloat(cogsResult[0]?.cogs || 0);
    const gross   = revenue - cogs;
    const margin  = revenue > 0 ? (gross / revenue) * 100 : 0;

    // Daily breakdown
    const daily = await prisma.$queryRaw`
      SELECT
        DATE(s.created_at) AS date,
        COUNT(s.id) AS transactions,
        COALESCE(SUM(s.total_amount), 0) AS revenue,
        COALESCE(SUM(si.cost_price * si.quantity), 0) AS cogs,
        COALESCE(SUM(s.total_amount) - SUM(si.cost_price * si.quantity), 0) AS gross_profit
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.business_id = ${req.user.business_id}::uuid AND s.status = 'completed'
      GROUP BY DATE(s.created_at)
      ORDER BY date DESC
      LIMIT 90
    `;

    res.json({
      summary: {
        revenue,
        cogs,
        gross_profit: gross,
        gross_margin_pct: parseFloat(margin.toFixed(2)),
        transactions: totals._count.id,
        total_discounts: parseFloat(totals._sum.discountAmount || 0) + parseFloat(totals._sum.couponDiscount || 0) + parseFloat(totals._sum.loyaltyDiscount || 0),
        total_tips: parseFloat(totals._sum.tipAmount || 0),
      },
      daily,
    });
  } catch (err) { next(err); }
});


reportsRouter.get('/dashboard', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const now   = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in14Days   = new Date(now.getTime() + 14 * 86400000);

    const [
      todaySales, monthSales, stockValue, lowStockCount,
      expiringBatches, openTasks, activeProjects,
      todayByMethod, recentSales, topProducts,
    ] = await Promise.all([
      // Today totals
      prisma.sale.aggregate({
        where: { businessId: bizId, status: 'completed', createdAt: { gte: todayStart } },
        _sum: { totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
        _count: { id: true },
      }),
      // Month revenue
      prisma.sale.aggregate({
        where: { businessId: bizId, status: 'completed', createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      // Stock value (cost)
      prisma.$queryRaw`
        SELECT COALESCE(SUM(sl.quantity * p.cost_price), 0) AS value, COUNT(DISTINCT p.id) AS product_count
        FROM stock_levels sl JOIN products p ON sl.product_id = p.id
        WHERE p.business_id = ${bizId}::uuid AND p.is_active = true
      `,
      // Low stock count
      prisma.$queryRaw`
        SELECT COUNT(*) AS count FROM (
          SELECT p.id FROM products p
          LEFT JOIN stock_levels sl ON sl.product_id = p.id
          WHERE p.business_id = ${bizId}::uuid AND p.is_active = true AND p.reorder_point > 0
          GROUP BY p.id, p.reorder_point
          HAVING COALESCE(SUM(sl.quantity), 0) <= p.reorder_point
        ) sub
      `,
      // Expiring batches in 14 days
      prisma.stockBatch.count({
        where: {
          product: { businessId: bizId, isActive: true },
          expiryDate: { lte: in14Days, gte: now },
          quantity: { gt: 0 },
        },
      }),
      // Open tasks
      prisma.task.count({ where: { businessId: bizId, status: { notIn: ['completed','cancelled'] } } }),
      // Active projects
      prisma.project.count({ where: { businessId: bizId, status: 'active' } }),
      // Today by payment method
      prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: { businessId: bizId, status: 'completed', createdAt: { gte: todayStart } },
        _sum: { totalAmount: true }, _count: { id: true },
      }),
      // Recent 5 sales
      prisma.sale.findMany({
        where: { businessId: bizId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, saleNumber: true, totalAmount: true, paymentMethod: true, createdAt: true, status: true, cashier: { select: { name: true } }, customer: { select: { name: true } } },
      }),
      // Top 5 products this month by revenue
      prisma.$queryRaw`
        SELECT p.name, p.id, SUM(si.quantity) AS units_sold, SUM(si.total_price) AS revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.business_id = ${bizId}::uuid AND s.status = 'completed'
          AND s.created_at >= ${monthStart}
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT 5
      `,
    ]);

    const todayByMethodMap = {};
    todayByMethod.forEach(r => { todayByMethodMap[r.paymentMethod] = parseFloat(r._sum.totalAmount || 0); });

    res.json({
      sales_today:       parseFloat(todaySales._sum.totalAmount  || 0),
      transactions_today: todaySales._count.id,
      sales_month:       parseFloat(monthSales._sum.totalAmount  || 0),
      stock_value:       parseFloat(stockValue[0]?.value         || 0),
      total_products:    parseInt(stockValue[0]?.product_count   || 0),
      low_stock_count:   parseInt(lowStockCount[0]?.count        || 0),
      expiring_soon:     expiringBatches,
      open_tasks:        openTasks,
      active_projects:   activeProjects,
      cash_today:        todayByMethodMap['cash']       || 0,
      zaad_today:        todayByMethodMap['zaad']       || 0,
      card_today:        (todayByMethodMap['visa'] || 0) + (todayByMethodMap['mastercard'] || 0) + (todayByMethodMap['stripe'] || 0),
      by_method:         todayByMethod,
      recent_sales:      recentSales,
      top_products:      topProducts,
    });
  } catch (err) { next(err); }
});

reportsRouter.get('/low-stock', auth, async (req, res, next) => {
  try {
    const { location_id } = req.query;
    const products = await prisma.product.findMany({
      where: { businessId: req.user.business_id, isActive: true, reorderPoint: { gt: 0 } },
      include: {
        stockLevels: {
          where: location_id ? { locationId: location_id } : undefined,
          include: { location: { select: { name: true } } },
        },
        category: { select: { name: true } },
        supplierProducts: {
          where: { isPreferred: true },
          include: { supplier: { select: { id: true, name: true, whatsapp: true } } },
          take: 1,
        },
      },
    });

    const lowStock = products
      .map(p => {
        const stock = p.stockLevels.reduce((s, sl) => s + sl.quantity, 0);
        return { ...p, total_stock: stock };
      })
      .filter(p => p.total_stock <= p.reorderPoint)
      .sort((a, b) => (a.total_stock / Math.max(a.reorderPoint, 1)) - (b.total_stock / Math.max(b.reorderPoint, 1)))
      .map(p => ({
        id: p.id, name: p.name, sku: p.sku,
        category: p.category?.name,
        total_stock: p.total_stock,
        reorder_point: p.reorderPoint,
        deficit: p.reorderPoint - p.total_stock,
        preferred_supplier: p.supplierProducts[0]?.supplier || null,
        cost_price: p.costPrice,
        estimated_reorder_cost: Math.max(0, p.reorderPoint - p.total_stock) * parseFloat(p.costPrice),
        locations: p.stockLevels.map(sl => ({ name: sl.location.name, quantity: sl.quantity })),
      }));

    res.json({
      count: lowStock.length,
      estimated_total_reorder_cost: lowStock.reduce((s, p) => s + parseFloat(p.estimated_reorder_cost), 0),
      products: lowStock,
    });
  } catch (err) { next(err); }
});

// ── USERS ─────────────────────────────────────────────────────────────────────
const usersRouter = express.Router();

usersRouter.get('/', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { businessId: req.user.business_id },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) { next(err); }
});

usersRouter.post('/', auth, requireRole('owner'), validate(CreateUserSchema), async (req, res, next) => {
  try {
    const { name, email, password, role, pin } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ title: 'Email already in use', status: 409 });
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { businessId: req.user.business_id, name, email, password: hashed, role, pin: pin || null },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

usersRouter.put('/:id', auth, requireRole('owner'), validate(UpdateUserSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name: req.body.name, role: req.body.role, isActive: req.body.is_active, pin: req.body.pin || null },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

// ── CATEGORIES ────────────────────────────────────────────────────────────────
const categoriesRouter = express.Router();

categoriesRouter.get('/', auth, async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { businessId: req.user.business_id },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
});

categoriesRouter.post('/', auth, requireRole('owner', 'manager'), validate(require('../validation/schemas').CategorySchema), async (req, res, next) => {
  try {
    const cat = await prisma.category.create({ data: { businessId: req.user.business_id, name: req.body.name, description: req.body.description, color: req.body.color } });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

categoriesRouter.put('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: { name: req.body.name, description: req.body.description, color: req.body.color } });
    res.json(cat);
  } catch (err) { next(err); }
});

// ── LOCATIONS ─────────────────────────────────────────────────────────────────
const locationsRouter = express.Router();

locationsRouter.get('/', auth, async (req, res, next) => {
  try {
    // `?all=1` includes disabled locations (management screen); default = active only.
    const includeInactive = ['1', 'true'].includes(String(req.query.all));
    const locations = await prisma.location.findMany({
      where: { businessId: req.user.business_id, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    res.json({ locations });
  } catch (err) { next(err); }
});

locationsRouter.post('/', auth, requireRole('owner', 'manager'), validate(LocationSchema), async (req, res, next) => {
  try {
    const loc = await prisma.location.create({ data: { businessId: req.user.business_id, name: req.body.name, type: req.body.type || 'warehouse', address: req.body.address, isActive: req.body.is_active ?? true } });
    res.status(201).json(loc);
  } catch (err) { next(err); }
});

locationsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(LocationSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.location.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const { name, type, address, is_active } = req.body;
    const loc = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        ...(name    !== undefined && { name }),
        ...(type    !== undefined && { type }),
        ...(address !== undefined && { address }),
        ...(is_active !== undefined && { isActive: is_active }),
      },
    });
    res.json(loc);
  } catch (err) { next(err); }
});

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
const customersRouter = express.Router();

customersRouter.get('/', auth, async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ customers });
  } catch (err) { next(err); }
});

customersRouter.post('/', auth, validate(CustomerSchema), async (req, res, next) => {
  try {
    const customer = await prisma.customer.create({ data: { businessId: req.user.business_id, name: req.body.name, phone: req.body.phone, whatsapp: req.body.whatsapp, email: req.body.email, address: req.body.address, creditLimit: req.body.credit_limit || 0, notes: req.body.notes } });
    res.status(201).json(customer);
  } catch (err) { next(err); }
});

customersRouter.put('/:id', auth, validate(CustomerSchema.partial()), async (req, res, next) => {
  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: { name: req.body.name, phone: req.body.phone, whatsapp: req.body.whatsapp, email: req.body.email, address: req.body.address, creditLimit: req.body.credit_limit, notes: req.body.notes } });
    res.json(customer);
  } catch (err) { next(err); }
});

customersRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { sales: { orderBy: { createdAt: 'desc' }, take: 20, select: { saleNumber: true, totalAmount: true, paymentMethod: true, createdAt: true, status: true } } },
    });
    if (!customer || customer.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(customer);
  } catch (err) { next(err); }
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
const settingsRouter = express.Router();

settingsRouter.get('/', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id } });
    res.json(biz);
  } catch (err) { next(err); }
});

settingsRouter.put('/', auth, requireRole('owner'), validate(SettingsSchema), async (req, res, next) => {
  try {
    const biz = await prisma.business.update({
      where: { id: req.user.business_id },
      data: { name: req.body.name, phone: req.body.phone, address: req.body.address, city: req.body.city, country: req.body.country, currency: req.body.currency, receiptHeader: req.body.receipt_header, receiptFooter: req.body.receipt_footer, taxNumber: req.body.tax_number },
    });
    res.json(biz);
  } catch (err) { next(err); }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
const notificationsRouter = express.Router();

notificationsRouter.get('/', auth, async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { businessId: req.user.business_id, OR: [{ userId: req.user.id }, { userId: null }] },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    res.json({ notifications });
  } catch (err) { next(err); }
});

notificationsRouter.put('/:id/read', auth, async (req, res, next) => {
  try {
    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
});

notificationsRouter.put('/read-all', auth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { businessId: req.user.business_id, userId: req.user.id }, data: { isRead: true } });
    res.json({ message: 'All marked as read.' });
  } catch (err) { next(err); }
});

module.exports = {
  suppliersRouter, stockRouter, tasksRouter, projectsRouter,
  reportsRouter, usersRouter, categoriesRouter, locationsRouter,
  customersRouter, settingsRouter, notificationsRouter,
};
