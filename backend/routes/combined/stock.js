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

// ── Stock Transfers ───────────────────────────────────────────────────────────
// The API speaks the reference language (pending / in_transit / completed); the
// DB enum predates it (pending / dispatched / received). Stock leaves the SOURCE
// when a transfer goes in transit and lands at the DESTINATION on completion —
// so in-transit goods are counted at neither shelf, exactly like a real van.
const TR_TO_DB  = { pending: 'pending', in_transit: 'dispatched', completed: 'received' };
const TR_TO_API = { pending: 'pending', approved: 'pending', dispatched: 'in_transit', received: 'completed', cancelled: 'cancelled' };
const trBad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });

const TRANSFER_INCLUDE = {
  fromLocation: true,
  toLocation: true,
  items: { include: { product: { select: { id: true, name: true, sku: true, costPrice: true } } } },
};
const trToApi = (t) => t && { ...t, status: TR_TO_API[t.status] || t.status };

/** Every product on the document must belong to the caller's business. */
async function trAssertProducts(tx, businessId, items) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const found = await tx.product.findMany({ where: { id: { in: ids }, businessId }, select: { id: true, name: true } });
  if (found.length !== ids.length) throw trBad('One of those products does not exist.', 404);
  return new Map(found.map((p) => [p.id, p.name]));
}

/** Deduct items from a location — locked read, refuses to go negative. */
async function trTakeStock(tx, { businessId, userId, transferId, locationId, items, names, what }) {
  for (const it of items) {
    const rows = await tx.$queryRaw`
      SELECT quantity FROM stock_levels
      WHERE product_id = ${it.product_id}::uuid AND location_id = ${locationId}::uuid
      FOR UPDATE`;
    const have = rows[0]?.quantity ?? 0;
    if (have < it.qty) {
      const name = (names && names.get(it.product_id)) || it.product_id;
      throw trBad(`Not enough stock ${what || 'to transfer'}: "${name}" has ${have} on hand, ${it.qty} needed.`);
    }
    await tx.$executeRaw`
      UPDATE stock_levels SET quantity = quantity - ${it.qty}, updated_at = NOW()
      WHERE product_id = ${it.product_id}::uuid AND location_id = ${locationId}::uuid`;
    await tx.stockMovement.create({
      data: {
        businessId, productId: it.product_id, locationId,
        type: 'transfer_out', quantity: -it.qty, balanceAfter: have - it.qty,
        referenceId: transferId, referenceType: 'stock_transfer', createdById: userId,
      },
    });
  }
}

/** Add items to a location (creating the level row when new). */
async function trGiveStock(tx, { businessId, userId, transferId, locationId, items }) {
  for (const it of items) {
    await tx.$executeRaw`
      INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at)
      VALUES (gen_random_uuid(), ${it.product_id}::uuid, ${locationId}::uuid, ${it.qty}, NOW())
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock_levels.quantity + ${it.qty}, updated_at = NOW()`;
    const after = (await tx.$queryRaw`
      SELECT quantity FROM stock_levels
      WHERE product_id = ${it.product_id}::uuid AND location_id = ${locationId}::uuid`)[0]?.quantity ?? it.qty;
    await tx.stockMovement.create({
      data: {
        businessId, productId: it.product_id, locationId,
        type: 'transfer_in', quantity: it.qty, balanceAfter: after,
        referenceId: transferId, referenceType: 'stock_transfer', createdById: userId,
      },
    });
  }
}

/** Undo a transfer's stock effects, judged from its CURRENT status — the same
 *  state-based-reversal rule the sales engine follows. In-transit goods return
 *  to the source; completed goods are pulled back off the destination first
 *  (refusing — not clamping — if the destination has already sold them). */
async function trReverseEffects(tx, { businessId, userId, transfer, names }) {
  const dispatched = transfer.items
    .map((i) => ({ product_id: i.productId, qty: i.dispatchedQty }))
    .filter((i) => i.qty > 0);
  const received = transfer.items
    .map((i) => ({ product_id: i.productId, qty: i.receivedQty }))
    .filter((i) => i.qty > 0);

  if (transfer.status === 'received' && received.length) {
    await trTakeStock(tx, {
      businessId, userId, transferId: transfer.id, locationId: transfer.toLocationId,
      items: received, names, what: 'to reverse at the destination',
    });
  }
  if ((transfer.status === 'received' || transfer.status === 'dispatched') && dispatched.length) {
    await trGiveStock(tx, {
      businessId, userId, transferId: transfer.id, locationId: transfer.fromLocationId,
      items: dispatched,
    });
  }
}

/** Lock the transfer row and load it with items — two concurrent edits/deletes
 *  must serialise, or both would reverse the same stock effects twice. */
async function trLoad(tx, { businessId, transferId }) {
  const locked = await tx.$queryRaw`
    SELECT id FROM stock_transfers WHERE id = ${transferId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
  if (!locked.length) throw trBad('Transfer not found.', 404);
  return tx.stockTransfer.findFirst({ where: { id: transferId, businessId }, include: { items: true } });
}

async function trAssertRef(tx, businessId, ref, excludeId) {
  const clash = await tx.stockTransfer.findFirst({
    where: { businessId, transferNumber: ref, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true },
  });
  if (clash) throw trBad(`Reference No "${ref}" is already used.`);
}

const trTotals = (items, shipping) => {
  const lines = items.reduce((s, i) => s + i.qty * (Number(i.unit_price) || 0), 0);
  return Math.round((lines + (Number(shipping) || 0)) * 100) / 100;
};

stockRouter.post('/transfers', auth, requireRole('owner', 'manager'), validate(TransferSchema), async (req, res, next) => {
  try {
    const { from_location_id, to_location_id, items, notes, ref_no, transfer_date, shipping_charges } = req.body;
    // Default COMPLETED, not pending: the pre-status API applied both stock legs
    // on every create, and a stale client that omits `status` (old cached SPA
    // tab, old integration) must keep getting that behaviour — not a silent
    // document that says 201 yet moves nothing. The new editor always sends one.
    const apiStatus = req.body.status || 'completed';

    // Both locations must belong to the caller's business.
    const locs = await prisma.location.findMany({
      where: { id: { in: [from_location_id, to_location_id] }, businessId: req.user.business_id },
      select: { id: true },
    });
    if (locs.length !== 2) return res.status(404).json({ title: 'Location not found', status: 404 });

    const transfer = await prisma.$transaction(async (tx) => {
      const names = await trAssertProducts(tx, req.user.business_id, items);
      const ref = (ref_no || '').trim() || `TRF-${Date.now()}`;
      if (ref_no && ref_no.trim()) await trAssertRef(tx, req.user.business_id, ref);

      const moved = apiStatus !== 'pending';    // stock has left the source
      const landed = apiStatus === 'completed'; // and arrived at the destination
      const t = await tx.stockTransfer.create({
        data: {
          businessId: req.user.business_id,
          transferNumber: ref,
          fromLocationId: from_location_id,
          toLocationId: to_location_id,
          status: TR_TO_DB[apiStatus],
          transferDate: transfer_date ? new Date(transfer_date) : new Date(),
          shippingCharges: Number(shipping_charges) || 0,
          totalAmount: trTotals(items, shipping_charges),
          notes,
          dispatchedAt: moved ? new Date() : null,
          receivedAt: landed ? new Date() : null,
          createdById: req.user.id,
          items: {
            create: items.map((i) => ({
              productId: i.product_id,
              requestedQty: i.qty,
              dispatchedQty: moved ? i.qty : 0,
              receivedQty: landed ? i.qty : 0,
              unitPrice: Number(i.unit_price) || 0,
            })),
          },
        },
      });

      if (moved) {
        await trTakeStock(tx, {
          businessId: req.user.business_id, userId: req.user.id, transferId: t.id,
          locationId: from_location_id, items, names,
        });
      }
      if (landed) {
        await trGiveStock(tx, {
          businessId: req.user.business_id, userId: req.user.id, transferId: t.id,
          locationId: to_location_id, items,
        });
      }

      return tx.stockTransfer.findFirst({ where: { id: t.id }, include: TRANSFER_INCLUDE });
    });

    res.status(201).json(trToApi(transfer));
  } catch (err) {
    next(err);
  }
});

// ── PUT /transfers/:id/status — move the document down its lifecycle ─────────
// pending → in_transit (stock leaves the source), in_transit → completed (stock
// lands at the destination), pending → completed (both at once). Never backwards.
stockRouter.put('/transfers/:id/status', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const next_ = String(req.body.status || '');
    if (!['in_transit', 'completed'].includes(next_)) {
      return res.status(400).json({ title: 'Status must be "in_transit" or "completed".', status: 400 });
    }
    const transfer = await prisma.$transaction(async (tx) => {
      const t = await trLoad(tx, { businessId: req.user.business_id, transferId: req.params.id });
      const cur = TR_TO_API[t.status];
      const order = { pending: 0, in_transit: 1, completed: 2 };
      if (!(order[next_] > order[cur])) {
        throw trBad(`This transfer is already ${cur.replace('_', ' ')} — status only moves forward.`);
      }
      const names = await trAssertProducts(tx, req.user.business_id, t.items.map((i) => ({ product_id: i.productId })));
      const qty = t.items.map((i) => ({ product_id: i.productId, qty: i.requestedQty })).filter((i) => i.qty > 0);

      if (cur === 'pending') {
        await trTakeStock(tx, {
          businessId: req.user.business_id, userId: req.user.id, transferId: t.id,
          locationId: t.fromLocationId, items: qty, names,
        });
        for (const i of t.items) {
          await tx.stockTransferItem.update({ where: { id: i.id }, data: { dispatchedQty: i.requestedQty } });
        }
      }
      if (next_ === 'completed') {
        await trGiveStock(tx, {
          businessId: req.user.business_id, userId: req.user.id, transferId: t.id,
          locationId: t.toLocationId, items: qty,
        });
        for (const i of t.items) {
          await tx.stockTransferItem.update({ where: { id: i.id }, data: { receivedQty: i.requestedQty } });
        }
      }
      await tx.stockTransfer.update({
        where: { id: t.id },
        data: {
          status: TR_TO_DB[next_],
          dispatchedAt: t.dispatchedAt || new Date(),
          ...(next_ === 'completed' && { receivedAt: new Date() }),
        },
      });
      return tx.stockTransfer.findFirst({ where: { id: t.id }, include: TRANSFER_INCLUDE });
    });
    res.json(trToApi(transfer));
  } catch (err) { next(err); }
});
// ======= GET ALL TRANSFERS =======
stockRouter.get('/transfers', auth, async (req, res, next) => {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      where: { businessId: req.user.business_id },
      include: TRANSFER_INCLUDE,
      orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }],
    });
    res.status(200).json(transfers.map(trToApi));
  } catch (err) { next(err); }
});

// ======= GET ONE TRANSFER =======
stockRouter.get('/transfers/:id', auth, async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: TRANSFER_INCLUDE,
    });
    if (!transfer) return res.status(404).json({ title: 'Transfer not found.', status: 404 });
    res.status(200).json(trToApi(transfer));
  } catch (err) { next(err); }
});

// ======= UPDATE TRANSFER (Reconciles quantities dynamically) =======
stockRouter.put('/transfers/:id', auth, requireRole('owner', 'manager'), validate(TransferSchema), async (req, res, next) => {
  try {
    const { from_location_id, to_location_id, items, notes, ref_no, transfer_date, shipping_charges } = req.body;
    const transferId = req.params.id;

    const locs = await prisma.location.findMany({
      where: { id: { in: [from_location_id, to_location_id] }, businessId: req.user.business_id },
      select: { id: true },
    });
    if (locs.length !== 2) return res.status(404).json({ title: 'Location not found', status: 404 });

    const updatedTransfer = await prisma.$transaction(async (tx) => {
      const existing = await trLoad(tx, { businessId: req.user.business_id, transferId });
      const oldNames = await trAssertProducts(tx, req.user.business_id, existing.items.map((i) => ({ product_id: i.productId })));
      const names = await trAssertProducts(tx, req.user.business_id, items);

      const apiStatus = req.body.status || TR_TO_API[existing.status];
      // A status outside the lifecycle (e.g. a legacy 'cancelled' row) must
      // dead-end here — falling through would deduct stock for a document
      // whose status column can't represent it.
      if (!TR_TO_DB[apiStatus]) throw trBad(`A ${String(apiStatus).replace('_', ' ')} transfer cannot be edited.`);
      if (ref_no && ref_no.trim()) await trAssertRef(tx, req.user.business_id, ref_no.trim(), transferId);

      // Take the OLD document's stock effects back off the shelves first, then
      // apply the new document from scratch — same reverse-and-repost shape as
      // editing a posted sale, so a double edit can never double-move stock.
      await trReverseEffects(tx, { businessId: req.user.business_id, userId: req.user.id, transfer: existing, names: oldNames });

      await tx.stockTransferItem.deleteMany({ where: { transferId } });
      const moved = apiStatus !== 'pending';
      const landed = apiStatus === 'completed';
      await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          fromLocationId: from_location_id,
          toLocationId: to_location_id,
          status: TR_TO_DB[apiStatus],
          ...(ref_no && ref_no.trim() && { transferNumber: ref_no.trim() }),
          ...(transfer_date && { transferDate: new Date(transfer_date) }),
          shippingCharges: Number(shipping_charges) || 0,
          totalAmount: trTotals(items, shipping_charges),
          // Full-document rewrite: a cleared note is REMOVED, not kept. Prisma
          // skips `undefined`, so an absent key must become an explicit null.
          notes: notes ?? null,
          dispatchedAt: moved ? (existing.dispatchedAt || new Date()) : null,
          receivedAt: landed ? (existing.receivedAt || new Date()) : null,
          items: {
            create: items.map((i) => ({
              productId: i.product_id,
              requestedQty: i.qty,
              dispatchedQty: moved ? i.qty : 0,
              receivedQty: landed ? i.qty : 0,
              unitPrice: Number(i.unit_price) || 0,
            })),
          },
        },
      });

      if (moved) {
        await trTakeStock(tx, {
          businessId: req.user.business_id, userId: req.user.id, transferId,
          locationId: from_location_id, items, names,
        });
      }
      if (landed) {
        await trGiveStock(tx, {
          businessId: req.user.business_id, userId: req.user.id, transferId,
          locationId: to_location_id, items,
        });
      }

      return tx.stockTransfer.findFirst({ where: { id: transferId }, include: TRANSFER_INCLUDE });
    });

    res.status(200).json(trToApi(updatedTransfer));
  } catch (err) { next(err); }
});

// ======= DELETE TRANSFER (Reverts inventory levels cleanly) =======
stockRouter.delete('/transfers/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const transferId = req.params.id;

    await prisma.$transaction(async (tx) => {
      const existing = await trLoad(tx, { businessId: req.user.business_id, transferId });
      const names = await trAssertProducts(tx, req.user.business_id, existing.items.map((i) => ({ product_id: i.productId })));

      // Refuses (never clamps) when the destination has already sold the goods —
      // clamping at 0 would quietly mint stock the business does not have.
      await trReverseEffects(tx, { businessId: req.user.business_id, userId: req.user.id, transfer: existing, names });

      await tx.stockTransferItem.deleteMany({ where: { transferId } });
      await tx.stockTransfer.delete({ where: { id: transferId } });
    });

    res.status(200).json({ success: true, message: 'Transfer deleted and inventory reverted.' });
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
