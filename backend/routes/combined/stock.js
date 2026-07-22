const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const accounting = require('../../lib/accounting');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, AdjustmentDocSchema, TransferSchema,
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

// ── Stock Adjustment documents ────────────────────────────────────────────────
// The reference's "Add Stock Adjustment": one document per event (location,
// Normal/Abnormal type, reference no, recovered amount, reason) with priced
// lines. Saving REMOVES the quantities from stock immediately, valued at FEFO
// layer cost for the GL (Dr 5050 Inventory adjustment / Cr 1200 Inventory);
// a recovered amount nets the loss (Dr cash / Cr 5050). Deleting the document
// (or editing it) reverses those effects from the stored per-line cost.
const adjBad = (msg, statusCode = 400) => Object.assign(new Error(msg), { statusCode });
const adjRound = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Postgres/Prisma always emit canonical LOWERCASE uuids, but Zod accepts
// uppercase — normalise once so Map lookups keyed by request ids can't miss
// the read-back rows (which would silently store unit costs of 0).
const adjNormIds = (items) => items.forEach((i) => { i.product_id = String(i.product_id).toLowerCase(); });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADJ_INCLUDE = {
  location: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, costPrice: true } } } },
};

async function adjLoad(tx, { businessId, docId }) {
  if (!UUID_RE.test(String(docId))) throw adjBad('Adjustment not found.', 404);
  // Lock first: two concurrent deletes/edits must serialise, or both would
  // restock the same goods twice. Same rule as sales and transfers.
  const locked = await tx.$queryRaw`
    SELECT id FROM stock_adjustment_docs WHERE id = ${docId}::uuid AND business_id = ${businessId}::uuid FOR UPDATE`;
  if (!locked.length) throw adjBad('Adjustment not found.', 404);
  return tx.stockAdjustmentDoc.findFirst({ where: { id: docId, businessId }, include: { items: true } });
}

async function adjAssertRef(tx, businessId, ref, excludeId) {
  const clash = await tx.stockAdjustmentDoc.findFirst({
    where: { businessId, referenceNo: ref, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true },
  });
  if (clash) throw adjBad(`Reference No "${ref}" is already used.`);
}

/** Remove one line's qty from the shelf, consuming FEFO cost layers; returns
 *  the unit cost actually consumed so the reversal can restock at it. */
async function adjConsume(tx, { businessId, userId, docId, locationId, productId, qty, name, fallbackCost }) {
  const rows = await tx.$queryRaw`
    SELECT quantity FROM stock_levels
    WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid
    FOR UPDATE`;
  const have = rows[0]?.quantity ?? 0;
  if (have < qty) throw adjBad(`Not enough stock to adjust: "${name}" has ${have} on hand, ${qty} needed.`);
  await tx.$executeRaw`
    UPDATE stock_levels SET quantity = quantity - ${qty}, updated_at = NOW()
    WHERE product_id = ${productId}::uuid AND location_id = ${locationId}::uuid`;

  const layers = await tx.$queryRaw`
    SELECT id, quantity_remaining, unit_cost FROM cost_layers
    WHERE product_id = ${productId}::uuid AND business_id = ${businessId}::uuid
      AND (location_id = ${locationId}::uuid OR location_id IS NULL)
      AND quantity_remaining > 0
    ORDER BY expiry_date ASC NULLS LAST, received_at ASC
    FOR UPDATE`;
  let remaining = qty, cost = 0;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(layer.quantity_remaining));
    await tx.$executeRaw`UPDATE cost_layers SET quantity_remaining = quantity_remaining - ${take} WHERE id = ${layer.id}::uuid`;
    cost += take * parseFloat(layer.unit_cost);
    remaining -= take;
  }
  // Stock can outrun its layers (opening balances) — value the rest at standard cost.
  if (remaining > 0) cost += remaining * (Number(fallbackCost) || 0);

  await tx.stockMovement.create({
    data: {
      businessId, productId, locationId,
      type: 'adjustment', quantity: -qty, balanceAfter: have - qty,
      referenceId: docId, referenceType: 'adjustment_doc', createdById: userId,
    },
  });
  return { cost: adjRound(cost), unitCost: qty > 0 ? cost / qty : 0 };
}

/** Put a document's goods back on the shelf at the cost they left it. The
 *  reversal value is the stored per-line totalCost — the EXACT amount the
 *  create posted as a loss — so the mirrored gain matches to the cent. */
async function adjRestock(tx, { businessId, userId, doc }) {
  let cost = 0;
  for (const it of doc.items) {
    const lineCost = adjRound(it.totalCost);
    cost = adjRound(cost + lineCost);
    const after = (await tx.$queryRaw`
      INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at)
      VALUES (gen_random_uuid(), ${it.productId}::uuid, ${doc.locationId}::uuid, ${it.quantity}, NOW())
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = stock_levels.quantity + ${it.quantity}, updated_at = NOW()
      RETURNING quantity`)[0]?.quantity ?? it.quantity;
    await tx.stockMovement.create({
      data: {
        businessId, productId: it.productId, locationId: doc.locationId,
        type: 'adjustment', quantity: it.quantity, balanceAfter: after,
        referenceId: doc.id, referenceType: 'adjustment_doc', createdById: userId,
      },
    });
    if (lineCost > 0 && it.quantity > 0) {
      await tx.costLayer.create({
        data: {
          businessId, productId: it.productId, locationId: doc.locationId,
          quantityReceived: it.quantity, quantityRemaining: it.quantity,
          // Layer precision is 4dp; the GL mirrors lineCost exactly either way.
          unitCost: Math.round((lineCost / it.quantity) * 10000) / 10000,
        },
      });
    }
  }
  return cost;
}

/** Undo a document's GL: restore inventory value, unwind any recovery. */
async function adjReverseGl(tx, { businessId, userId, doc, cost }) {
  if (cost > 0) {
    await accounting.postInventoryAdjustment(tx, {
      businessId, amount: cost, gain: true,
      sourceType: 'stock_adjustment_doc', sourceId: doc.id, createdById: userId,
    });
  }
  const recovered = adjRound(doc.totalRecovered);
  if (recovered > 0) {
    await accounting.postJournal(tx, {
      businessId, description: 'Adjustment recovery reversed',
      sourceType: 'stock_adjustment_doc', sourceId: doc.id, createdById: userId,
      lines: [
        { code: '5050', debit: recovered, credit: 0, description: 'Recovery reversed' },
        { code: '1000', debit: 0, credit: recovered, description: 'Cash returned' },
      ],
    });
  }
}

/** Write the document's stock + GL effects: consume every line, post the loss
 *  and any recovery. Returns per-product consumed costs (line total + unit). */
async function adjApplyEffects(tx, { businessId, userId, doc, items, names, costs }) {
  let totalCost = 0;
  const lineCosts = new Map();
  for (const it of items) {
    const { cost, unitCost } = await adjConsume(tx, {
      businessId, userId, docId: doc.id, locationId: doc.locationId,
      productId: it.product_id, qty: it.qty,
      name: names.get(it.product_id), fallbackCost: costs.get(it.product_id),
    });
    totalCost = adjRound(totalCost + cost);
    lineCosts.set(it.product_id, { cost, unitCost });
  }
  if (totalCost > 0) {
    await accounting.postInventoryAdjustment(tx, {
      businessId, amount: totalCost, gain: false,
      sourceType: 'stock_adjustment_doc', sourceId: doc.id, createdById: userId,
    });
  }
  const recovered = adjRound(doc.totalRecovered);
  // Recovery beyond the loss would fabricate income inside an expense account —
  // refuse, per the codebase rule of refusing rather than clamping.
  if (recovered > totalCost) {
    throw adjBad(`Recovered amount (${recovered.toFixed(2)}) cannot exceed the adjustment's cost value (${totalCost.toFixed(2)}).`);
  }
  if (recovered > 0) {
    await accounting.postJournal(tx, {
      businessId, description: 'Adjustment recovery',
      sourceType: 'stock_adjustment_doc', sourceId: doc.id, createdById: userId,
      lines: [
        { code: '1000', debit: recovered, credit: 0, description: 'Recovered amount' },
        { code: '5050', debit: 0, credit: recovered, description: 'Loss recovered' },
      ],
    });
  }
  return lineCosts;
}

/** Products must belong to the business; returns name + cost maps. */
async function adjAssertProducts(tx, businessId, items) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const found = await tx.product.findMany({
    where: { id: { in: ids }, businessId },
    select: { id: true, name: true, costPrice: true, enableStock: true },
  });
  if (found.length !== ids.length) throw adjBad('One of those products does not exist.', 404);
  const untracked = found.find((p) => p.enableStock === false);
  if (untracked) throw adjBad(`"${untracked.name}" does not manage stock — there is nothing to adjust.`);
  return {
    names: new Map(found.map((p) => [p.id, p.name])),
    costs: new Map(found.map((p) => [p.id, parseFloat(p.costPrice) || 0])),
  };
}

const adjTotals = (items) => adjRound(items.reduce((s, i) => s + i.qty * (Number(i.unit_price) || 0), 0));

stockRouter.get('/adjustments/docs', auth, async (req, res, next) => {
  try {
    const docs = await prisma.stockAdjustmentDoc.findMany({
      where: { businessId: req.user.business_id },
      include: ADJ_INCLUDE,
      orderBy: [{ adjustmentDate: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(docs);
  } catch (err) { next(err); }
});

stockRouter.get('/adjustments/docs/:id', auth, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Adjustment not found.', status: 404 });
    const doc = await prisma.stockAdjustmentDoc.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: ADJ_INCLUDE,
    });
    if (!doc) return res.status(404).json({ title: 'Adjustment not found.', status: 404 });
    res.json(doc);
  } catch (err) { next(err); }
});

stockRouter.post('/adjustments/docs', auth, requireRole('owner', 'manager'), validate(AdjustmentDocSchema), async (req, res, next) => {
  try {
    const { location_id, ref_no, adjustment_date, type, total_recovered, reason, items } = req.body;
    const loc = await prisma.location.findFirst({
      where: { id: location_id, businessId: req.user.business_id }, select: { id: true },
    });
    if (!loc) return res.status(404).json({ title: 'Location not found', status: 404 });

    adjNormIds(items);
    const doc = await prisma.$transaction(async (tx) => {
      const { names, costs } = await adjAssertProducts(tx, req.user.business_id, items);
      const ref = (ref_no || '').trim() || `${await require('../../lib/prefix').refPrefix(tx, req.user.business_id, 'prefix_stock_adjustment', 'ADJ')}-${Date.now()}`;
      if (ref_no && ref_no.trim()) await adjAssertRef(tx, req.user.business_id, ref);

      const d = await tx.stockAdjustmentDoc.create({
        data: {
          businessId: req.user.business_id,
          referenceNo: ref,
          locationId: location_id,
          type,
          adjustmentDate: adjustment_date ? new Date(adjustment_date) : new Date(),
          totalAmount: adjTotals(items),
          totalRecovered: adjRound(total_recovered),
          reason,
          createdById: req.user.id,
          items: {
            create: items.map((i) => ({
              productId: i.product_id,
              quantity: i.qty,
              unitPrice: adjRound(i.unit_price),
            })),
          },
        },
        include: { items: true },
      });

      const lineCosts = await adjApplyEffects(tx, {
        businessId: req.user.business_id, userId: req.user.id, doc: d, items, names, costs,
      });
      for (const it of d.items) {
        const lc = lineCosts.get(it.productId) || { cost: 0, unitCost: 0 };
        await tx.stockAdjustmentDocItem.update({
          where: { id: it.id },
          data: { unitCost: adjRound(lc.unitCost), totalCost: adjRound(lc.cost) },
        });
      }
      return tx.stockAdjustmentDoc.findFirst({ where: { id: d.id }, include: ADJ_INCLUDE });
    });

    res.status(201).json(doc);
  } catch (err) { next(err); }
});

stockRouter.put('/adjustments/docs/:id', auth, requireRole('owner', 'manager'), validate(AdjustmentDocSchema), async (req, res, next) => {
  try {
    const { location_id, ref_no, adjustment_date, type, total_recovered, reason, items } = req.body;
    const docId = req.params.id;
    const loc = await prisma.location.findFirst({
      where: { id: location_id, businessId: req.user.business_id }, select: { id: true },
    });
    if (!loc) return res.status(404).json({ title: 'Location not found', status: 404 });

    adjNormIds(items);
    const doc = await prisma.$transaction(async (tx) => {
      const existing = await adjLoad(tx, { businessId: req.user.business_id, docId });
      const { names, costs } = await adjAssertProducts(tx, req.user.business_id, items);
      if (ref_no && ref_no.trim()) await adjAssertRef(tx, req.user.business_id, ref_no.trim(), docId);

      // Reverse-and-reapply, like editing a posted sale or transfer: the old
      // document's goods go back at their stored cost, its GL is mirrored out,
      // then the new document posts from scratch.
      const reversedCost = await adjRestock(tx, { businessId: req.user.business_id, userId: req.user.id, doc: existing });
      await adjReverseGl(tx, { businessId: req.user.business_id, userId: req.user.id, doc: existing, cost: reversedCost });

      await tx.stockAdjustmentDocItem.deleteMany({ where: { docId } });
      const updated = await tx.stockAdjustmentDoc.update({
        where: { id: docId },
        data: {
          locationId: location_id,
          ...(ref_no && ref_no.trim() && { referenceNo: ref_no.trim() }),
          type,
          ...(adjustment_date && { adjustmentDate: new Date(adjustment_date) }),
          totalAmount: adjTotals(items),
          totalRecovered: adjRound(total_recovered),
          reason: reason ?? null,
          items: {
            create: items.map((i) => ({
              productId: i.product_id,
              quantity: i.qty,
              unitPrice: adjRound(i.unit_price),
            })),
          },
        },
        include: { items: true },
      });

      const lineCosts = await adjApplyEffects(tx, {
        businessId: req.user.business_id, userId: req.user.id, doc: updated, items, names, costs,
      });
      for (const it of updated.items) {
        const lc = lineCosts.get(it.productId) || { cost: 0, unitCost: 0 };
        await tx.stockAdjustmentDocItem.update({
          where: { id: it.id },
          data: { unitCost: adjRound(lc.unitCost), totalCost: adjRound(lc.cost) },
        });
      }
      return tx.stockAdjustmentDoc.findFirst({ where: { id: docId }, include: ADJ_INCLUDE });
    });

    res.json(doc);
  } catch (err) { next(err); }
});

stockRouter.delete('/adjustments/docs/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await adjLoad(tx, { businessId: req.user.business_id, docId: req.params.id });
      const cost = await adjRestock(tx, { businessId: req.user.business_id, userId: req.user.id, doc: existing });
      await adjReverseGl(tx, { businessId: req.user.business_id, userId: req.user.id, doc: existing, cost });
      await tx.stockAdjustmentDocItem.deleteMany({ where: { docId: req.params.id } });
      await tx.stockAdjustmentDoc.delete({ where: { id: req.params.id } });
    });
    res.json({ success: true, message: 'Adjustment deleted and stock restored.' });
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
  if (!UUID_RE.test(String(transferId))) throw trBad('Transfer not found.', 404);
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

    items.forEach((i) => { i.product_id = String(i.product_id).toLowerCase(); });
    const transfer = await prisma.$transaction(async (tx) => {
      const names = await trAssertProducts(tx, req.user.business_id, items);
      const ref = (ref_no || '').trim() || `${await require('../../lib/prefix').refPrefix(tx, req.user.business_id, 'prefix_stock_transfer', 'TRF')}-${Date.now()}`;
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
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ title: 'Transfer not found.', status: 404 });
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
