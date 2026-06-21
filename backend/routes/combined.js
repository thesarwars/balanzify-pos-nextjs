const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
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

stockRouter.post('/adjustments', auth, requireRole('owner', 'manager'), validate(AdjustmentSchema), async (req, res, next) => {
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
      include: {
        location: { select: { name: true } },
        product: { select: { name: true, costPrice: true } },
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

stockRouter.post('/transfers', auth, requireRole('owner', 'manager'), validate(TransferSchema), async (req, res, next) => {
  try {
    const { from_location_id, to_location_id, items, notes } = req.body;
    if (from_location_id === to_location_id) {
      return res.status(400).json({ title: 'Source and destination must differ', status: 400 });
    }

    // Both locations must belong to the caller's business.
    const locs = await prisma.location.findMany({
      where: { id: { in: [from_location_id, to_location_id] }, businessId: req.user.business_id },
      select: { id: true },
    });
    if (locs.length !== 2) return res.status(404).json({ title: 'Location not found', status: 404 });

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
              receivedQty: i.qty,
            })),
          },
        },
      });

      for (const item of items) {
        // Lock the source row and verify there is enough to move — never clamp
        // at 0 (which would "transfer" stock that doesn't exist and create it at
        // the destination out of nothing).
        const srcRows = await tx.$queryRaw`
          SELECT quantity FROM stock_levels
          WHERE product_id = ${item.product_id}::uuid AND location_id = ${from_location_id}::uuid
          FOR UPDATE
        `;
        const srcQty = srcRows[0]?.quantity ?? 0;
        if (srcQty < item.qty) {
          throw Object.assign(
            new Error(`Insufficient stock to transfer: product ${item.product_id} has ${srcQty} at source, requested ${item.qty}.`),
            { statusCode: 400, code: 'INSUFFICIENT_STOCK' }
          );
        }

        // Deduct from source
        await tx.$executeRaw`
          UPDATE stock_levels SET quantity = quantity - ${item.qty}, updated_at = NOW()
          WHERE product_id = ${item.product_id}::uuid AND location_id = ${from_location_id}::uuid
        `;
        await tx.stockMovement.create({
          data: {
            businessId: req.user.business_id, productId: item.product_id, locationId: from_location_id,
            type: 'transfer_out', quantity: -item.qty, balanceAfter: srcQty - item.qty,
            referenceId: t.id, referenceType: 'stock_transfer', createdById: req.user.id,
          },
        });

        // Add to destination
        const destRows = await tx.$executeRaw`
          INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at)
          VALUES (gen_random_uuid(), ${item.product_id}::uuid, ${to_location_id}::uuid, ${item.qty}, NOW())
          ON CONFLICT (product_id, location_id)
          DO UPDATE SET quantity = stock_levels.quantity + ${item.qty}, updated_at = NOW()
        `;
        const destQty = (await tx.$queryRaw`
          SELECT quantity FROM stock_levels
          WHERE product_id = ${item.product_id}::uuid AND location_id = ${to_location_id}::uuid
        `)[0]?.quantity ?? item.qty;
        await tx.stockMovement.create({
          data: {
            businessId: req.user.business_id, productId: item.product_id, locationId: to_location_id,
            type: 'transfer_in', quantity: item.qty, balanceAfter: destQty,
            referenceId: t.id, referenceType: 'stock_transfer', createdById: req.user.id,
          },
        });
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
stockRouter.put('/transfers/:id', auth, requireRole('owner', 'manager'), validate(TransferSchema), async (req, res, next) => {
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
stockRouter.delete('/transfers/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
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
    // Bound by_day with a real Date parameter (never interpolate a conditional
    // SQL fragment into a tagged $queryRaw — it becomes a bound param → syntax error).
    const fromDate = from ? new Date(from) : new Date('2000-01-01');
    const [totals, byMethod, byDay] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { totalAmount: true, discountAmount: true }, _count: { id: true }, _avg: { totalAmount: true } }),
      prisma.sale.groupBy({ by: ['paymentMethod'], where, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*)::int as count, SUM(total_amount) as revenue
        FROM sales WHERE business_id = ${req.user.business_id}::uuid AND status = 'completed'
          AND created_at >= ${fromDate}
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
      todayByMethod, recentSales, topProducts, hourlyRows,
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
      // Today's revenue by hour (drives the 8:00–21:00 chart)
      prisma.$queryRaw`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COALESCE(SUM(total_amount), 0)::float AS revenue
        FROM sales
        WHERE business_id = ${bizId}::uuid AND status = 'completed' AND created_at >= ${todayStart}
        GROUP BY 1
      `,
    ]);

    // 14 buckets for hours 8..21 to match the dashboard chart
    const hourMap = {};
    hourlyRows.forEach(r => { hourMap[Number(r.hour)] = parseFloat(r.revenue || 0); });
    const hourly = Array.from({ length: 14 }, (_, i) => Math.round(hourMap[8 + i] || 0));

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
      hourly,
    });
  } catch (err) { next(err); }
});

// Revenue by product category for a period (defaults to the current month).
reportsRouter.get('/sales-by-category', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const now = new Date();
    const fromDate = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(c.name, 'Uncategorized') AS name, COALESCE(SUM(si.total_price), 0)::float AS revenue
      FROM sale_items si
      JOIN sales s    ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.business_id = ${bizId}::uuid AND s.status = 'completed' AND s.created_at >= ${fromDate}
      GROUP BY 1
      ORDER BY revenue DESC
    `;
    res.json({ categories: rows.map(r => ({ name: r.name, revenue: parseFloat(r.revenue || 0) })) });
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

// ── Commission report settings (calc method + agent source) ──
reportsRouter.get('/commission/settings', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { commissionCalc: true, commissionAgentType: true } });
    res.json({ calculation_type: biz?.commissionCalc || 'invoice_value', agent_type: biz?.commissionAgentType || 'logged_in_user' });
  } catch (err) { next(err); }
});
reportsRouter.put('/commission/settings', auth, requireRole('owner', 'manager'), validate(CommissionSettingsSchema), async (req, res, next) => {
  try {
    const { calculation_type, agent_type } = req.body;
    const biz = await prisma.business.update({
      where: { id: req.user.business_id },
      data: { ...(calculation_type && { commissionCalc: calculation_type }), ...(agent_type && { commissionAgentType: agent_type }) },
      select: { commissionCalc: true, commissionAgentType: true },
    });
    res.json({ calculation_type: biz.commissionCalc, agent_type: biz.commissionAgentType });
  } catch (err) { next(err); }
});

// Per-rep sales + commission. `calc` = invoice_value | payment_received.
reportsRouter.get('/commission/reps', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const payCalc = req.query.calc === 'payment_received';
    const [users, agg] = await Promise.all([
      prisma.user.findMany({ where: { businessId: req.user.business_id }, select: { id: true, name: true, role: true, commissionPercent: true } }),
      prisma.sale.groupBy({
        by: ['cashierId'],
        where: { businessId: req.user.business_id, status: 'completed' },
        _sum: { totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
        _count: { id: true },
      }),
    ]);
    const byUser = Object.fromEntries(agg.map(a => [a.cashierId, a]));
    const reps = users.map(u => {
      const a = byUser[u.id];
      const totalSale = parseFloat(a?._sum.totalAmount || 0);
      const totalReceived = parseFloat(a?._sum.cashAmount || 0) + parseFloat(a?._sum.zaadAmount || 0) + parseFloat(a?._sum.cardAmount || 0);
      const pct = parseFloat(u.commissionPercent || 0);
      const base = payCalc ? totalReceived : totalSale;
      return {
        user_id: u.id, name: u.name, role_name: u.role.charAt(0).toUpperCase() + u.role.slice(1),
        commission_percent: pct, total_sale: totalSale, total_received: totalReceived,
        tx_count: a?._count.id || 0, commission: +(base * pct / 100).toFixed(2),
      };
    }).sort((x, y) => y.commission - x.commission);
    res.json(reps);
  } catch (err) { next(err); }
});

reportsRouter.get('/commission/reps/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { name: true, commissionPercent: true } });
    if (!user) return res.status(404).json({ title: 'Not found', status: 404 });
    const sales = await prisma.sale.findMany({
      where: { businessId: req.user.business_id, cashierId: req.params.id },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, saleNumber: true, status: true, totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
    });
    res.json({
      name: user.name, commission_percent: parseFloat(user.commissionPercent || 0),
      transactions: sales.map(s => ({
        id: s.saleNumber || s.id, status: s.status,
        total: parseFloat(s.totalAmount || 0),
        received: parseFloat(s.cashAmount || 0) + parseFloat(s.zaadAmount || 0) + parseFloat(s.cardAmount || 0),
      })),
    });
  } catch (err) { next(err); }
});

// Cash-register sessions (shifts) report.
reportsRouter.get('/registers', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const shifts = await prisma.shift.findMany({
      where: { businessId: req.user.business_id },
      include: { cashier: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { openedAt: 'desc' }, take: 100,
    });
    res.json(shifts.map(s => ({
      id: s.id,
      user_name: s.cashier?.name || '—',
      location_name: s.location?.name || '—',
      opened_at: s.openedAt ? s.openedAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      closed_at: s.closedAt ? s.closedAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      opening_cash: parseFloat(s.openingFloat || 0),
      total_sales: parseFloat(s.totalSales || 0),
      expected_cash: parseFloat(s.expectedCash != null ? s.expectedCash : (parseFloat(s.openingFloat || 0) + parseFloat(s.totalCash || 0))),
      refunds: 0,
      status: s.status,
      totals: { cash: parseFloat(s.totalCash || 0), zaad: parseFloat(s.totalZaad || 0), evc: 0, card: parseFloat(s.totalCard || 0), bank: 0 },
    })));
  } catch (err) { next(err); }
});

// ── USERS ─────────────────────────────────────────────────────────────────────
const usersRouter = express.Router();

usersRouter.get('/', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { businessId: req.user.business_id },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true, commissionPercent: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) { next(err); }
});

usersRouter.post('/', auth, requireRole('owner'), validate(CreateUserSchema), async (req, res, next) => {
  try {
    const { name, email, password, role, pin, commission_percent } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ title: 'Email already in use', status: 409 });
    const hashed = await bcrypt.hash(password, 12);
    const hashedPin = pin ? await bcrypt.hash(String(pin), 10) : null;
    const user = await prisma.user.create({
      data: { businessId: req.user.business_id, name, email, password: hashed, role, pin: hashedPin, commissionPercent: commission_percent ?? 0 },
      select: { id: true, name: true, email: true, role: true, isActive: true, commissionPercent: true },
    });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

usersRouter.put('/:id', auth, requireRole('owner'), validate(UpdateUserSchema), async (req, res, next) => {
  try {
    // Tenant isolation: only operate on users within the caller's business.
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      select: { id: true, role: true },
    });
    if (!target) return res.status(404).json({ title: 'User not found', status: 404 });

    // Guardrail: never let the last active owner be demoted or deactivated,
    // which would lock the business out of its own admin functions.
    const demotingOrDisabling =
      (req.body.role !== undefined && req.body.role !== 'owner') ||
      req.body.is_active === false;
    if (target.role === 'owner' && demotingOrDisabling) {
      const otherOwners = await prisma.user.count({
        where: { businessId: req.user.business_id, role: 'owner', isActive: true, id: { not: target.id } },
      });
      if (otherOwners === 0) {
        return res.status(409).json({ title: 'Cannot remove the last active owner', status: 409 });
      }
    }

    const hashedPin = req.body.pin ? await bcrypt.hash(String(req.body.pin), 10) : null;
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { name: req.body.name, role: req.body.role, isActive: req.body.is_active, ...(req.body.pin !== undefined && { pin: hashedPin }), ...(req.body.commission_percent !== undefined && { commissionPercent: req.body.commission_percent }) },
      select: { id: true, name: true, email: true, role: true, isActive: true, commissionPercent: true },
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
    // Tenant isolation: scope the update to the caller's business.
    const result = await prisma.category.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { name: req.body.name, description: req.body.description, color: req.body.color },
    });
    if (result.count === 0) return res.status(404).json({ title: 'Category not found', status: 404 });
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
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
      include: { customerGroup: { select: { name: true, discountPct: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ customers });
  } catch (err) { next(err); }
});

customersRouter.post('/', auth, validate(CustomerSchema), async (req, res, next) => {
  try {
    const customer = await prisma.customer.create({ data: { businessId: req.user.business_id, name: req.body.name, phone: req.body.phone, whatsapp: req.body.whatsapp, email: req.body.email, address: req.body.address, creditLimit: req.body.credit_limit || 0, customerGroupId: req.body.customer_group_id || null, notes: req.body.notes } });
    res.status(201).json(customer);
  } catch (err) { next(err); }
});

customersRouter.put('/:id', auth, validate(CustomerSchema.partial()), async (req, res, next) => {
  try {
    // Tenant isolation: scope the update to the caller's business.
    const result = await prisma.customer.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { name: req.body.name, phone: req.body.phone, whatsapp: req.body.whatsapp, email: req.body.email, address: req.body.address, creditLimit: req.body.credit_limit, customerGroupId: req.body.customer_group_id, notes: req.body.notes },
    });
    if (result.count === 0) return res.status(404).json({ title: 'Customer not found', status: 404 });
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
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
    // Whitelist the fields returned — never leak internal columns
    // (enabledModules, market flags, billing linkage, raw timestamps).
    const biz = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: {
        id: true, name: true, phone: true, address: true, city: true, country: true,
        currency: true, receiptHeader: true, receiptFooter: true, taxNumber: true,
      },
    });
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
    // Tenant isolation: only notifications belonging to this business and
    // addressed to this user (or broadcast) can be marked read.
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id, OR: [{ userId: req.user.id }, { userId: null }] },
      data: { isRead: true },
    });
    if (result.count === 0) return res.status(404).json({ title: 'Notification not found', status: 404 });
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
});

notificationsRouter.put('/read-all', auth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { businessId: req.user.business_id, userId: req.user.id }, data: { isRead: true } });
    res.json({ message: 'All marked as read.' });
  } catch (err) { next(err); }
});

// ── EXPENSES ──────────────────────────────────────────────────────────────────
const expensesRouter = express.Router();

expensesRouter.get('/', auth, async (req, res, next) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { businessId: req.user.business_id },
      include: { category: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
    res.json({ expenses });
  } catch (err) { next(err); }
});

expensesRouter.post('/', auth, validate(ExpenseSchema), async (req, res, next) => {
  try {
    const { category_id, location_id, amount, date, payment_status, expense_for, note, is_refund } = req.body;
    const expense = await prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          businessId: req.user.business_id,
          categoryId: category_id || null,
          locationId: location_id || null,
          expenseNumber: `EXP-${Date.now()}`,
          amount,
          paymentStatus: payment_status || 'paid',
          expenseFor: expense_for || null,
          note: note || null,
          isRefund: is_refund || false,
          expenseDate: date ? new Date(date) : new Date(),
          createdById: req.user.id,
        },
        include: { category: { select: { name: true } }, location: { select: { name: true } } },
      });
      // GL: record the expense against cash (or payables if unpaid).
      await accounting.postExpense(tx, {
        businessId: req.user.business_id, amount,
        paid: (payment_status || 'paid') === 'paid', isRefund: is_refund || false,
        description: e.category?.name ? `Expense — ${e.category.name}` : 'Operating expense',
        sourceId: e.id, createdById: req.user.id,
      });
      return e;
    });
    res.status(201).json(expense);
  } catch (err) { next(err); }
});

expensesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const exp = await prisma.expense.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!exp) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ message: 'Expense deleted.' });
  } catch (err) { next(err); }
});

const expenseCategoriesRouter = express.Router();

expenseCategoriesRouter.get('/', auth, async (req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { businessId: req.user.business_id }, orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) { next(err); }
});

expenseCategoriesRouter.post('/', auth, requireRole('owner', 'manager'), validate(ExpenseCategorySchema), async (req, res, next) => {
  try {
    const category = await prisma.expenseCategory.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name },
      update: {},
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
});

// ── PAYMENT ACCOUNTS ──────────────────────────────────────────────────────────
const paymentAccountsRouter = express.Router();

paymentAccountsRouter.get('/', auth, async (req, res, next) => {
  try {
    const accounts = await prisma.paymentAccount.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ accounts });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PaymentAccountSchema), async (req, res, next) => {
  try {
    const { name, type, account_number, balance } = req.body;
    const account = await prisma.paymentAccount.create({
      data: { businessId: req.user.business_id, name, type: type || 'Cash', accountNumber: account_number || null, balance: balance || 0 },
    });
    res.status(201).json(account);
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/transfer', auth, requireRole('owner', 'manager'), validate(AccountTransferSchema), async (req, res, next) => {
  try {
    const { from_id, to_id, amount } = req.body;
    const [from, to] = await Promise.all([
      prisma.paymentAccount.findFirst({ where: { id: from_id, businessId: req.user.business_id } }),
      prisma.paymentAccount.findFirst({ where: { id: to_id, businessId: req.user.business_id } }),
    ]);
    if (!from || !to) return res.status(404).json({ title: 'Account not found', status: 404 });
    if (parseFloat(from.balance) < amount) return res.status(400).json({ title: 'Insufficient balance', status: 400 });
    await prisma.$transaction([
      prisma.paymentAccount.update({ where: { id: from_id }, data: { balance: { decrement: amount } } }),
      prisma.paymentAccount.update({ where: { id: to_id }, data: { balance: { increment: amount } } }),
    ]);
    res.json({ message: 'Transfer complete.' });
  } catch (err) { next(err); }
});

paymentAccountsRouter.post('/:id/deposit', auth, requireRole('owner', 'manager'), validate(AccountDepositSchema), async (req, res, next) => {
  try {
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { balance: { increment: req.body.amount } } });
    res.json(updated);
  } catch (err) { next(err); }
});

paymentAccountsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const acc = await prisma.paymentAccount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!acc) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.paymentAccount.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Account removed.' });
  } catch (err) { next(err); }
});

// ── CUSTOMER GROUPS ───────────────────────────────────────────────────────────
const customerGroupsRouter = express.Router();

customerGroupsRouter.get('/', auth, async (req, res, next) => {
  try {
    const groups = await prisma.customerGroup.findMany({
      where: { businessId: req.user.business_id },
      include: { _count: { select: { customers: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ groups });
  } catch (err) { next(err); }
});

customerGroupsRouter.post('/', auth, requireRole('owner', 'manager'), validate(CustomerGroupSchema), async (req, res, next) => {
  try {
    const group = await prisma.customerGroup.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name, discountPct: req.body.amount || 0 },
      update: { discountPct: req.body.amount || 0 },
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});

customerGroupsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const grp = await prisma.customerGroup.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!grp) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.customerGroup.delete({ where: { id: req.params.id } });  // FK sets customers.customer_group_id NULL
    res.json({ message: 'Group removed.' });
  } catch (err) { next(err); }
});

// ── PRODUCT REFERENCE DATA: units / brands / variation templates ──────────────
const unitsRouter = express.Router();

unitsRouter.get('/', auth, async (req, res, next) => {
  try {
    const units = await prisma.unit.findMany({ where: { businessId: req.user.business_id }, orderBy: { actualName: 'asc' } });
    res.json({ units });
  } catch (err) { next(err); }
});
unitsRouter.post('/', auth, requireRole('owner', 'manager'), validate(UnitSchema), async (req, res, next) => {
  try {
    const unit = await prisma.unit.create({ data: { businessId: req.user.business_id, actualName: req.body.actual_name, shortName: req.body.short_name, allowDecimal: req.body.allow_decimal || false } });
    res.status(201).json(unit);
  } catch (err) { next(err); }
});
unitsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(UnitSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.unit.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const { actual_name, short_name, allow_decimal } = req.body;
    const unit = await prisma.unit.update({ where: { id: req.params.id }, data: {
      ...(actual_name   !== undefined && { actualName: actual_name }),
      ...(short_name    !== undefined && { shortName: short_name }),
      ...(allow_decimal !== undefined && { allowDecimal: allow_decimal }),
    }});
    res.json(unit);
  } catch (err) { next(err); }
});
unitsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const u = await prisma.unit.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!u) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.unit.delete({ where: { id: req.params.id } });
    res.json({ message: 'Unit removed.' });
  } catch (err) { next(err); }
});

const brandsRouter = express.Router();

brandsRouter.get('/', auth, async (req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({ where: { businessId: req.user.business_id }, orderBy: { name: 'asc' } });
    res.json({ brands });
  } catch (err) { next(err); }
});
brandsRouter.post('/', auth, requireRole('owner', 'manager'), validate(BrandSchema), async (req, res, next) => {
  try {
    const brand = await prisma.brand.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name },
      update: {},
    });
    res.status(201).json(brand);
  } catch (err) { next(err); }
});
brandsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const b = await prisma.brand.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!b) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.brand.delete({ where: { id: req.params.id } });  // FK sets products.brand_id NULL
    res.json({ message: 'Brand removed.' });
  } catch (err) { next(err); }
});

const variationsRouter = express.Router();

variationsRouter.get('/', auth, async (req, res, next) => {
  try {
    const variations = await prisma.variationTemplate.findMany({ where: { businessId: req.user.business_id }, orderBy: { name: 'asc' } });
    res.json({ variations });
  } catch (err) { next(err); }
});
variationsRouter.post('/', auth, requireRole('owner', 'manager'), validate(VariationTemplateSchema), async (req, res, next) => {
  try {
    const variation = await prisma.variationTemplate.create({ data: { businessId: req.user.business_id, name: req.body.name, values: req.body.values || [] } });
    res.status(201).json(variation);
  } catch (err) { next(err); }
});
variationsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const v = await prisma.variationTemplate.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!v) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.variationTemplate.delete({ where: { id: req.params.id } });
    res.json({ message: 'Variation removed.' });
  } catch (err) { next(err); }
});

// ── DISCOUNTS ─────────────────────────────────────────────────────────────────
const discountsRouter = express.Router();

function mapDiscount(b) {
  const m = {};
  if (b.name        !== undefined) m.name = b.name;
  if (b.type        !== undefined) m.type = b.type;
  if (b.value       !== undefined) m.value = b.value;
  if (b.priority    !== undefined) m.priority = b.priority;
  if (b.category    !== undefined) m.category = b.category || null;
  if (b.brand_id    !== undefined) m.brandId = b.brand_id || null;
  if (b.location_id !== undefined) m.locationId = b.location_id || null;
  if (b.starts_at   !== undefined) m.startsAt = b.starts_at ? new Date(b.starts_at) : null;
  if (b.ends_at     !== undefined) m.endsAt = b.ends_at ? new Date(b.ends_at) : null;
  if (b.apply_price_groups    !== undefined) m.applyPriceGroups = b.apply_price_groups;
  if (b.apply_customer_groups !== undefined) m.applyCustomerGroups = b.apply_customer_groups;
  if (b.is_active   !== undefined) m.isActive = b.is_active;
  return m;
}
const discountInclude = { brand: { select: { name: true } }, location: { select: { name: true } } };

discountsRouter.get('/', auth, async (req, res, next) => {
  try {
    const discounts = await prisma.discount.findMany({
      where: { businessId: req.user.business_id },
      include: discountInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ discounts });
  } catch (err) { next(err); }
});
discountsRouter.post('/', auth, requireRole('owner', 'manager'), validate(DiscountSchema), async (req, res, next) => {
  try {
    const discount = await prisma.discount.create({ data: { businessId: req.user.business_id, ...mapDiscount(req.body) }, include: discountInclude });
    res.status(201).json(discount);
  } catch (err) { next(err); }
});
discountsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(DiscountSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.discount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const discount = await prisma.discount.update({ where: { id: req.params.id }, data: mapDiscount(req.body), include: discountInclude });
    res.json(discount);
  } catch (err) { next(err); }
});
discountsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const d = await prisma.discount.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!d) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.discount.delete({ where: { id: req.params.id } });
    res.json({ message: 'Discount deleted.' });
  } catch (err) { next(err); }
});

// ── PRICE GROUPS ──────────────────────────────────────────────────────────────
const priceGroupsRouter = express.Router();

priceGroupsRouter.get('/', auth, async (req, res, next) => {
  try {
    const priceGroups = await prisma.priceGroup.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json({ priceGroups });
  } catch (err) { next(err); }
});
priceGroupsRouter.post('/', auth, requireRole('owner', 'manager'), validate(PriceGroupSchema), async (req, res, next) => {
  try {
    const group = await prisma.priceGroup.upsert({
      where: { businessId_name: { businessId: req.user.business_id, name: req.body.name } },
      create: { businessId: req.user.business_id, name: req.body.name, percent: req.body.percent || 0 },
      update: { percent: req.body.percent || 0 },
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});
priceGroupsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const g = await prisma.priceGroup.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!g) return res.status(404).json({ title: 'Not found', status: 404 });
    if (g.isDefault) return res.status(422).json({ title: 'The default price group cannot be deleted.', status: 422 });
    await prisma.priceGroup.delete({ where: { id: req.params.id } });
    res.json({ message: 'Price group removed.' });
  } catch (err) { next(err); }
});

// ── INVOICE LAYOUTS & SCHEMES ─────────────────────────────────────────────────
const invoiceLayoutsRouter = express.Router();

function mapInvoiceLayout(b) {
  const m = {};
  if (b.name                !== undefined) m.name = b.name;
  if (b.design              !== undefined) m.design = b.design;
  if (b.header_text         !== undefined) m.headerText = b.header_text;
  if (b.footer_text         !== undefined) m.footerText = b.footer_text;
  if (b.show_address        !== undefined) m.showAddress = b.show_address;
  if (b.show_tax_summary    !== undefined) m.showTaxSummary = b.show_tax_summary;
  if (b.show_total_in_words !== undefined) m.showTotalInWords = b.show_total_in_words;
  if (b.show_discount       !== undefined) m.showDiscount = b.show_discount;
  if (b.show_qr             !== undefined) m.showQr = b.show_qr;
  if (b.show_letterhead     !== undefined) m.showLetterhead = b.show_letterhead;
  if (b.hide_prices         !== undefined) m.hidePrices = b.hide_prices;
  if (b.is_default          !== undefined) m.isDefault = b.is_default;
  return m;
}

invoiceLayoutsRouter.get('/', auth, async (req, res, next) => {
  try {
    const layouts = await prisma.invoiceLayout.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ layouts });
  } catch (err) { next(err); }
});
invoiceLayoutsRouter.post('/', auth, requireRole('owner', 'manager'), validate(InvoiceLayoutSchema), async (req, res, next) => {
  try {
    const count = await prisma.invoiceLayout.count({ where: { businessId: req.user.business_id } });
    const layout = await prisma.invoiceLayout.create({
      data: { businessId: req.user.business_id, ...mapInvoiceLayout(req.body), ...(count === 0 && { isDefault: true }) },
    });
    res.status(201).json(layout);
  } catch (err) { next(err); }
});
invoiceLayoutsRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(InvoiceLayoutSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.invoiceLayout.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (req.body.is_default === true) {
      await prisma.invoiceLayout.updateMany({ where: { businessId: req.user.business_id, isDefault: true, id: { not: req.params.id } }, data: { isDefault: false } });
    }
    const layout = await prisma.invoiceLayout.update({ where: { id: req.params.id }, data: mapInvoiceLayout(req.body) });
    res.json(layout);
  } catch (err) { next(err); }
});
invoiceLayoutsRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const l = await prisma.invoiceLayout.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!l) return res.status(404).json({ title: 'Not found', status: 404 });
    if (l.isDefault) return res.status(422).json({ title: 'The default layout cannot be deleted.', status: 422 });
    await prisma.invoiceLayout.delete({ where: { id: req.params.id } });
    res.json({ message: 'Layout deleted.' });
  } catch (err) { next(err); }
});

const invoiceSchemesRouter = express.Router();

invoiceSchemesRouter.get('/', auth, async (req, res, next) => {
  try {
    const schemes = await prisma.invoiceScheme.findMany({ where: { businessId: req.user.business_id }, orderBy: { createdAt: 'asc' } });
    res.json({ schemes });
  } catch (err) { next(err); }
});
invoiceSchemesRouter.post('/', auth, requireRole('owner', 'manager'), validate(InvoiceSchemeSchema), async (req, res, next) => {
  try {
    const { name, prefix, start_number, total_digits } = req.body;
    const scheme = await prisma.invoiceScheme.create({ data: { businessId: req.user.business_id, name, prefix: prefix || null, startNumber: start_number ?? 1, totalDigits: total_digits ?? 4 } });
    res.status(201).json(scheme);
  } catch (err) { next(err); }
});
invoiceSchemesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const s = await prisma.invoiceScheme.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!s) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.invoiceScheme.delete({ where: { id: req.params.id } });
    res.json({ message: 'Scheme deleted.' });
  } catch (err) { next(err); }
});

// ── SERVICE TYPES (restaurant) ──────────────────────────────────────────────────
const serviceTypesRouter = express.Router();
const DEFAULT_SERVICE_TYPES = [
  { name: 'Dine-in',           packingCharge: 0,   packingChargeType: 'fixed' },
  { name: 'Parcel / Takeaway', packingCharge: 0.5, packingChargeType: 'fixed' },
  { name: 'Delivery',          packingCharge: 5,   packingChargeType: 'percentage' },
];
async function ensureServiceTypes(businessId) {
  if ((await prisma.serviceType.count({ where: { businessId } })) === 0) {
    await prisma.serviceType.createMany({ data: DEFAULT_SERVICE_TYPES.map(t => ({ businessId, ...t })) });
  }
}
const serializeServiceType = (t) => ({ id: t.id, name: t.name, packing_charge: parseFloat(t.packingCharge), packing_charge_type: t.packingChargeType, enabled: t.enabled });

serviceTypesRouter.get('/', auth, async (req, res, next) => {
  try {
    await ensureServiceTypes(req.user.business_id);
    const all = ['1', 'true'].includes(String(req.query.all));
    const types = await prisma.serviceType.findMany({
      where: { businessId: req.user.business_id, ...(all ? {} : { enabled: true }) },
      orderBy: { createdAt: 'asc' },
    });
    res.json(types.map(serializeServiceType));
  } catch (err) { next(err); }
});
serviceTypesRouter.post('/', auth, requireRole('owner', 'manager'), validate(ServiceTypeSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const t = await prisma.serviceType.create({ data: { businessId: req.user.business_id, name: b.name, packingCharge: b.packing_charge || 0, packingChargeType: b.packing_charge_type || 'fixed', enabled: b.enabled ?? true } });
    res.status(201).json(serializeServiceType(t));
  } catch (err) { next(err); }
});
serviceTypesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(ServiceTypeSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.serviceType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    const b = req.body;
    const t = await prisma.serviceType.update({ where: { id: req.params.id }, data: {
      ...(b.name !== undefined && { name: b.name }),
      ...(b.packing_charge !== undefined && { packingCharge: b.packing_charge }),
      ...(b.packing_charge_type !== undefined && { packingChargeType: b.packing_charge_type }),
      ...(b.enabled !== undefined && { enabled: b.enabled }),
    }});
    res.json(serializeServiceType(t));
  } catch (err) { next(err); }
});
serviceTypesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const t = await prisma.serviceType.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!t) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.serviceType.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = {
  suppliersRouter, stockRouter, tasksRouter, projectsRouter,
  reportsRouter, usersRouter, categoriesRouter, locationsRouter,
  customersRouter, settingsRouter, notificationsRouter,
  expensesRouter, expenseCategoriesRouter, paymentAccountsRouter,
  customerGroupsRouter, unitsRouter, brandsRouter, variationsRouter,
  discountsRouter, priceGroupsRouter, invoiceLayoutsRouter, invoiceSchemesRouter,
  serviceTypesRouter,
};
