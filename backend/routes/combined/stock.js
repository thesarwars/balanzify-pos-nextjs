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

// Stock valuation at cost — from the live FIFO/FEFO cost layers, so it
// reconciles to the GL Inventory account (1200). The number a lender or owner
// asks for: what is the stock on hand actually worth?
stockRouter.get('/valuation', auth, async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT cl.product_id, p.name, p.sku,
             COALESCE(SUM(cl.quantity_remaining), 0)::int AS qty,
             ROUND(SUM(cl.quantity_remaining * cl.unit_cost)::numeric, 2) AS value
      FROM cost_layers cl
      JOIN products p ON p.id = cl.product_id
      WHERE cl.business_id = ${req.user.business_id}::uuid AND cl.quantity_remaining > 0
      GROUP BY cl.product_id, p.name, p.sku
      ORDER BY value DESC`;
    const items = rows.map(r => ({ product_id: r.product_id, name: r.name, sku: r.sku, quantity: r.qty, value: parseFloat(r.value) }));
    res.json({ items, total_value: +items.reduce((s, i) => s + i.value, 0).toFixed(2), product_count: items.length });
  } catch (err) { next(err); }
});

// Expiring stock — cost layers (so quantities are live) with an expiry within
// the window, nearest first, plus the value at risk. Drives sell-through / pull
// decisions before write-off.
stockRouter.get('/expiring', auth, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const cutoff = new Date(Date.now() + days * 86400000);
    const rows = await prisma.$queryRaw`
      SELECT cl.product_id, p.name, p.sku, cl.expiry_date,
             cl.quantity_remaining::int AS qty,
             ROUND((cl.quantity_remaining * cl.unit_cost)::numeric, 2) AS value
      FROM cost_layers cl
      JOIN products p ON p.id = cl.product_id
      WHERE cl.business_id = ${req.user.business_id}::uuid
        AND cl.quantity_remaining > 0
        AND cl.expiry_date IS NOT NULL
        AND cl.expiry_date <= ${cutoff}
      ORDER BY cl.expiry_date ASC`;
    const now = Date.now();
    const layers = rows.map(r => ({
      product_id: r.product_id, name: r.name, sku: r.sku,
      expiry_date: r.expiry_date, quantity: r.qty, value: parseFloat(r.value),
      expired: new Date(r.expiry_date).getTime() < now,
    }));
    res.json({
      window_days: days,
      expiring: layers,
      already_expired: layers.filter(l => l.expired).length,
      value_at_risk: +layers.reduce((s, l) => s + l.value, 0).toFixed(2),
    });
  } catch (err) { next(err); }
});

stockRouter.post('/adjustments/:id/approve', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const adj = await prisma.stockAdjustment.findUnique({ where: { id: req.params.id } });
    if (!adj || adj.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (adj.status !== 'pending') return res.status(400).json({ title: 'Already processed', status: 400 });

    // Value the adjustment at cost so the GL Inventory balance tracks the stock.
    // unitCost defaults to 0 on capture — fall back to the product's cost then.
    const product = await prisma.product.findUnique({ where: { id: adj.productId }, select: { costPrice: true } });
    const unitCost = parseFloat(adj.unitCost) > 0 ? parseFloat(adj.unitCost) : parseFloat(product?.costPrice || 0);
    const value = Math.abs(adj.quantity) * unitCost;

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
      // GL: a write-off/loss is an expense; 'found' is a gain. Inventory follows.
      if (value > 0) {
        await accounting.postInventoryAdjustment(tx, {
          businessId: req.user.business_id, amount: value, gain: adj.quantity > 0,
          sourceType: 'stock_adjustment', sourceId: adj.id, createdById: req.user.id,
        });
      }
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


module.exports = { stockRouter };
