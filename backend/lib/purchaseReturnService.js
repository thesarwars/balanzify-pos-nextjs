const prisma = require('./prisma');

// ── Purchase return engine ───────────────────────────────────────────────────
// The one place that reverses a receipt. Both entry points use it:
//   POST /purchase-orders/:id/returns   (return from one purchase)
//   POST /purchase-returns              (return by supplier + product)
//
// A returned unit MUST be attributed to a specific purchase line, because that
// line's cost layers say what the goods cost. Everything below is per line.

const multiplierOf = (unit) => (unit && unit.baseUnitId && unit.baseMultiplier ? Number(unit.baseMultiplier) : 1);

/**
 * Reverse a set of purchase lines inside an open transaction.
 * @param tx        prisma transaction client
 * @param entries   [{ line, qty }] — `line` is a PurchaseOrderItem including `unit`
 *                  and `purchaseOrder` (id, locationId); `qty` is in PURCHASE units.
 * @returns { subtotal, returnItemsData } — subtotal is the landed cost relieved.
 */
async function reverseLines(tx, { businessId, userId, entries }) {
  let subtotal = 0;
  const returnItemsData = [];

  for (const { line, qty } of entries) {
    const poId = line.poId;
    const locId = line.purchaseOrder ? line.purchaseOrder.locationId : null;
    if (!locId) {
      throw Object.assign(new Error('That purchase has no location, so its stock cannot be returned.'), { statusCode: 400 });
    }

    const mult = multiplierOf(line.unit);
    // A fractional multiple cannot be converted to the integer base units that
    // stock and cost layers are counted in: Math.round() would relieve more (or
    // less) inventory and AP than the goods are worth, and the shortfall would be
    // stranded. New units are validated as whole multiples; refuse the rest rather
    // than post a wrong journal.
    if (!Number.isInteger(mult)) {
      throw Object.assign(new Error(`"${line.unit ? line.unit.actualName : 'That unit'}" is defined as ${mult} of its base unit. Make it a whole multiple before returning goods bought in it.`), { statusCode: 400 });
    }
    const baseQty = Math.round(qty * mult);
    if (baseQty <= 0) {
      throw Object.assign(new Error('Return quantity for that line is too small to convert into stock units.'), { statusCode: 400 });
    }

    // Enforce the returnable cap ATOMICALLY. This guarded, row-locking update
    // serialises concurrent returns of the same line and rejects over-returns.
    const capped = await tx.$executeRaw`
      UPDATE purchase_order_items SET returned_qty = returned_qty + ${qty}
      WHERE id = ${line.id}::uuid AND received_qty - returned_qty >= ${qty}
    `;
    if (capped === 0) {
      throw Object.assign(new Error('That quantity is no longer returnable — the line was modified concurrently.'), { statusCode: 409 });
    }

    // Take stock_levels BEFORE cost_layers. A sale locks them in that order
    // (routes/sales.js), and locking them the other way round here would let a
    // concurrent sale and return of the same product deadlock. Guarded, so
    // on-hand stock can never go negative under a race.
    const affected = await tx.$executeRaw`
      UPDATE stock_levels SET quantity = quantity - ${baseQty}, updated_at = NOW()
      WHERE product_id = ${line.productId}::uuid AND location_id = ${locId}::uuid AND quantity >= ${baseQty}
    `;
    if (affected === 0) {
      throw Object.assign(new Error(`Not enough stock on hand to return ${baseQty} unit(s).`), { statusCode: 400 });
    }

    // Lock this purchase's own cost layers so a concurrent sale or return can't
    // consume them from under us, then consume FEFO at their landed cost.
    const layers = await tx.$queryRaw`
      SELECT id, quantity_remaining, unit_cost FROM cost_layers
      WHERE po_id = ${poId}::uuid AND product_id = ${line.productId}::uuid AND location_id = ${locId}::uuid AND quantity_remaining > 0
      ORDER BY expiry_date ASC NULLS LAST, received_at ASC
      FOR UPDATE
    `;
    const available = layers.reduce((s, l) => s + Number(l.quantity_remaining), 0);
    if (available < baseQty) {
      throw Object.assign(new Error(`Only ${available} unit(s) from that purchase remain in stock — cannot return ${baseQty}.`), { statusCode: 400 });
    }

    let toPull = baseQty; let lineCost = 0;
    for (const layer of layers) {
      if (toPull <= 0) break;
      const take = Math.min(toPull, Number(layer.quantity_remaining));
      const dec = await tx.$executeRaw`UPDATE cost_layers SET quantity_remaining = quantity_remaining - ${take} WHERE id = ${layer.id}::uuid AND quantity_remaining >= ${take}`;
      if (dec === 0) {
        throw Object.assign(new Error('A cost layer changed during the return — please retry.'), { statusCode: 409 });
      }
      lineCost += take * parseFloat(layer.unit_cost);
      toPull -= take;
    }
    lineCost = +lineCost.toFixed(2);
    subtotal += lineCost;

    await tx.stockMovement.create({
      data: { businessId, productId: line.productId, locationId: locId, type: 'return', quantity: -baseQty, referenceType: 'purchase_return', createdById: userId },
    });

    // Reduce matching stock batches FEFO so Σ batch qty stays in step with stock.
    let batchToPull = baseQty;
    const batches = await tx.stockBatch.findMany({ where: { productId: line.productId, locationId: locId, quantity: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }] });
    for (const b of batches) {
      if (batchToPull <= 0) break;
      const take = Math.min(batchToPull, b.quantity);
      await tx.stockBatch.update({ where: { id: b.id }, data: { quantity: { decrement: take } } });
      batchToPull -= take;
    }

    returnItemsData.push({
      purchaseOrderItemId: line.id, productId: line.productId, variantId: line.variantId || null,
      quantity: qty, unitPrice: qty > 0 ? +(lineCost / qty).toFixed(4) : 0, totalPrice: lineCost,
    });
  }

  return { subtotal: +subtotal.toFixed(2), returnItemsData };
}

/** Identifies one returnable bucket: a product AS PURCHASED in a given unit. */
const groupKey = (productId, unitId) => `${productId}|${unitId || ''}`;

/**
 * What can still be returned to `supplierId` at `locationId`, per product AND
 * purchase unit.
 *
 * A line bought in a multiple unit (e.g. Dozen) is returned in whole Dozens —
 * `purchase_order_items.returned_qty` and `purchase_return_items.quantity` are
 * both integers counted in PURCHASE units. So a product bought as Pieces on one
 * purchase and as Dozens on another yields two buckets, each with its own cap
 * and its own per-purchase-unit cost. The caller picks a bucket, not a product.
 */
async function returnableForSupplier(businessId, supplierId, locationId, search) {
  const items = await prisma.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: { businessId, supplierId, locationId },
      ...(search ? { product: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } } : {}),
    },
    include: {
      unit: true,
      product: { select: { id: true, name: true, sku: true } },
      purchaseOrder: { select: { id: true, poNumber: true, createdAt: true, locationId: true } },
    },
    orderBy: { purchaseOrder: { createdAt: 'asc' } },   // FIFO across purchases
  });

  // Lines of the same product on the same purchase share one cost-layer pool, and
  // the loop below drains it as it goes. Take the LARGEST purchase unit first: 16
  // pieces in the pool can yield "1 Dozen + 4 loose", but if the loose line drains
  // 5 first, floor(11/12) = 0 and the Dozen becomes un-returnable. Ties on
  // createdAt (same purchase) would otherwise be ordered arbitrarily by Postgres,
  // so `id` pins it down and the endpoint stops being nondeterministic.
  const usable = items
    .filter((i) => i.receivedQty - i.returnedQty > 0)
    .sort((a, b) =>
      a.purchaseOrder.createdAt - b.purchaseOrder.createdAt
      || multiplierOf(b.unit) - multiplierOf(a.unit)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!usable.length) return [];

  // Remaining cost-layer stock per (purchase, product) — the real cap — along
  // with the weighted LANDED cost, which is what a return actually relieves.
  // (The PO line's unitPrice excludes freight capitalised at receipt.)
  // Layers are counted in BASE units, so compare against qty × multiplier.
  const poIds = [...new Set(usable.map((i) => i.poId))];
  const layers = await prisma.$queryRaw`
    SELECT po_id, product_id,
           SUM(quantity_remaining)::int AS qty,
           SUM(quantity_remaining * unit_cost) / NULLIF(SUM(quantity_remaining), 0) AS unit_cost
    FROM cost_layers
    WHERE business_id = ${businessId}::uuid
      AND location_id = ${locationId}::uuid
      AND quantity_remaining > 0
      AND po_id = ANY(${poIds}::uuid[])
    GROUP BY po_id, product_id
  `;
  const pool = new Map();    // (po, product) → base units still in stock
  const costOf = new Map();  // (po, product) → weighted landed cost per BASE unit
  for (const l of layers) {
    const key = `${l.po_id}:${l.product_id}`;
    pool.set(key, Number(l.qty) || 0);
    costOf.set(key, parseFloat(l.unit_cost) || 0);
  }

  const byGroup = new Map();
  for (const it of usable) {
    const poKey = `${it.poId}:${it.productId}`;
    const leftBase = pool.get(poKey) || 0;
    if (leftBase <= 0) continue;

    const mult = multiplierOf(it.unit);
    // Only whole purchase units can be returned, so the layer cap floors.
    const qty = Math.min(it.receivedQty - it.returnedQty, Math.floor(leftBase / mult));
    if (qty <= 0) continue;
    // Lines of the same product on the same purchase share one layer pool,
    // whatever unit each was bought in.
    pool.set(poKey, leftBase - qty * mult);

    const baseCost = costOf.get(poKey) || parseFloat(it.unitPrice) / mult;
    const unitCost = +(baseCost * mult).toFixed(4);   // per PURCHASE unit

    const key = groupKey(it.productId, it.unitId);
    const entry = byGroup.get(key) || {
      product_id: it.productId, name: it.product.name, sku: it.product.sku || '',
      unit_id: it.unitId || null,
      unit_name: it.unit ? it.unit.shortName || it.unit.actualName : '',
      base_multiplier: mult,
      returnable: 0, cost_total: 0, candidates: [],
    };
    entry.returnable += qty;
    entry.cost_total += qty * unitCost;
    entry.candidates.push({ po_item_id: it.id, po_id: it.poId, po_number: it.purchaseOrder.poNumber, qty, unit_cost: unitCost });
    byGroup.set(key, entry);
  }

  return [...byGroup.values()].map((e) => ({
    product_id: e.product_id, name: e.name, sku: e.sku,
    unit_id: e.unit_id, unit_name: e.unit_name, base_multiplier: e.base_multiplier,
    returnable: e.returnable,
    unit_cost: e.returnable > 0 ? +(e.cost_total / e.returnable).toFixed(4) : 0,
    candidates: e.candidates,
  }));
}

/**
 * Spread a requested quantity across a bucket's purchase lines, oldest first.
 * `requested` and every candidate qty are in the bucket's PURCHASE unit.
 * Throws when the supplier simply doesn't have that much left to return.
 */
function allocate(entry, requested) {
  let left = requested;
  const picked = [];
  for (const c of entry.candidates) {
    if (left <= 0) break;
    const take = Math.min(left, c.qty);
    picked.push({ po_item_id: c.po_item_id, qty: take });
    left -= take;
  }
  if (left > 0) {
    const have = entry.candidates.reduce((s, c) => s + c.qty, 0);
    const unit = entry.unit_name ? ` ${entry.unit_name}` : ' unit(s)';
    throw Object.assign(new Error(`Only ${have}${unit} of "${entry.name}" can still be returned to this supplier at this location.`), { statusCode: 400 });
  }
  return picked;
}

module.exports = { reverseLines, returnableForSupplier, allocate, multiplierOf, groupKey };
