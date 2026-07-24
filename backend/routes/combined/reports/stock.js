

const express = require('express');
const prisma = require('../../../lib/prisma');
const { auth, requireRole } = require('../../../middleware/auth');
const { PL_POSTED, PL_DATE_RE, PL_UUID_RE, plNum, plRound, plParseDay, plRange } = require('./_shared');

const router = express.Router();

// ── Stock report ─────────────────────────────────────────────────────────────
// Per product × variant × location: current stock valued at purchase (cost
// layers) and sale price, potential profit, and units sold / transferred in
// & out / adjusted. Location + category filters, product custom-field columns,
// and a closing-stock / potential-profit / margin summary.
router.get('/stock', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const loc = req.query.location_id || null;
    const category = req.query.category_id || null;
    for (const [k, v] of [['location_id', loc], ['category_id', category]]) {
      if (v && !(typeof v === 'string' && PL_UUID_RE.test(v))) {
        return res.status(400).json({ title: `${k} must be a UUID.`, status: 400 });
      }
    }

    const [products, fieldDefs, layers, moves, locations] = await Promise.all([
      prisma.product.findMany({
        where: { businessId: bizId, isActive: true, ...(category && { categoryId: category }) },
        select: {
          id: true, name: true, sku: true, sellingPrice: true, unitOfMeasure: true, customValues: true,
          category: { select: { name: true } },
          variants: { where: { isActive: true }, select: { id: true, sku: true, attributes: true, sellingPrice: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.customFieldDef.findMany({
        where: { businessId: bizId, entity: 'product', isActive: true },
        select: { id: true, label: true }, orderBy: { sortOrder: 'asc' },
      }),
      prisma.costLayer.findMany({
        where: { businessId: bizId, quantityRemaining: { gt: 0 }, ...(loc && { locationId: loc }) },
        select: { productId: true, variantId: true, locationId: true, quantityRemaining: true, unitCost: true },
      }),
      prisma.stockMovement.groupBy({
        by: ['productId', 'variantId', 'locationId', 'type'],
        where: { businessId: bizId, ...(loc && { locationId: loc }) },
        _sum: { quantity: true },
      }),
      prisma.location.findMany({ where: { businessId: bizId }, select: { id: true, name: true } }),
    ]);

    const locName = (id) => (locations.find((l) => l.id === id) || {}).name || '';
    const attrName = (a) => { try { return Object.values(a || {}).join(' / '); } catch { return ''; } };
    const mvKey = (p, v, l) => `${p}:${v || ''}:${l || ''}`;

    const mv = {};
    for (const m of moves) {
      const k = mvKey(m.productId, m.variantId, m.locationId);
      const row = mv[k] || (mv[k] = { sold: 0, transferred_in: 0, transferred_out: 0, adjusted: 0 });
      const q = Math.abs(m._sum.quantity || 0);
      if (m.type === 'sale') row.sold += q;
      else if (m.type === 'transfer_in') row.transferred_in += q;
      else if (m.type === 'transfer_out') row.transferred_out += q;
      else if (m.type === 'adjustment') row.adjusted += q;
    }

    // A (product,variant,location) cell exists if it has remaining stock OR any
    // movement history — otherwise sold-out cells and their sold/transfer/adjust
    // counts silently vanish.
    const stockRows = {};
    const cellFor = (pid, vid, lid) => {
      const k = mvKey(pid, vid, lid);
      return stockRows[k] || (stockRows[k] = { productId: pid, variantId: vid || null, locationId: lid || null, qty: 0, valuePurchase: 0 });
    };
    for (const cl of layers) {
      const r = cellFor(cl.productId, cl.variantId, cl.locationId);
      r.qty += cl.quantityRemaining;
      r.valuePurchase += cl.quantityRemaining * plNum(cl.unitCost);
    }
    // Movement-only cells (sold through, transferred out) get a zero-stock row.
    for (const m of moves) cellFor(m.productId, m.variantId, m.locationId);
    const cellsByProduct = {};
    for (const k of Object.keys(stockRows)) {
      const r = stockRows[k];
      (cellsByProduct[r.productId] || (cellsByProduct[r.productId] = [])).push(r);
    }

    // Product custom_values are keyed by the field-def id (see products-screen),
    // so read by id and expose the human label as the column header.
    const fields = fieldDefs.map(f => f.label);
    const fieldIds = fieldDefs.map(f => f.id);
    const out = [];
    const pushRow = (p, variant, locationId, qty, valuePurchase) => {
      const sellPrice = variant ? plNum(variant.sellingPrice) : plNum(p.sellingPrice);
      const valueSale = plRound(qty * sellPrice);
      const m = mv[mvKey(p.id, variant ? variant.id : null, locationId)] || { sold: 0, transferred_in: 0, transferred_out: 0, adjusted: 0 };
      const cv = (p.customValues && typeof p.customValues === 'object') ? p.customValues : {};
      out.push({
        product_id: p.id, variant_id: variant ? variant.id : null,
        sku: (variant && variant.sku) || p.sku, product: p.name,
        variation: variant ? attrName(variant.attributes) : '',
        category: (p.category && p.category.name) || '',
        location: locationId ? locName(locationId) : '', location_id: locationId || null,
        unit_selling_price: sellPrice,
        current_stock: qty,
        stock_value_purchase: plRound(valuePurchase),
        stock_value_sale: valueSale,
        potential_profit: plRound(valueSale - valuePurchase),
        total_sold: m.sold, total_transferred_in: m.transferred_in, total_transferred_out: m.transferred_out, total_adjusted: m.adjusted,
        unit: p.unitOfMeasure || 'unit',
        custom: fieldIds.map(id => (cv[id] != null ? String(cv[id]) : '')),
      });
    };

    for (const p of products) {
      const cells = cellsByProduct[p.id];
      if (!cells || !cells.length) {
        // Never stocked, never moved — show it flat so the catalog is complete.
        if (p.variants.length) p.variants.forEach(v => pushRow(p, v, loc, 0, 0));
        else pushRow(p, null, loc, 0, 0);
        continue;
      }
      for (const r of cells) {
        const variant = r.variantId ? p.variants.find((v) => v.id === r.variantId) : null;
        pushRow(p, variant, r.locationId, r.qty, r.valuePurchase);
      }
    }

    const closingPurchase = plRound(out.reduce((s, r) => s + r.stock_value_purchase, 0));
    const closingSale = plRound(out.reduce((s, r) => s + r.stock_value_sale, 0));
    const potential = plRound(closingSale - closingPurchase);
    res.json({
      location_id: loc, category_id: category,
      custom_fields: fields,
      rows: out,
      summary: {
        closing_stock_purchase: closingPurchase,
        closing_stock_sale: closingSale,
        potential_profit: potential,
        profit_margin_pct: closingSale > 0 ? plRound((potential / closingSale) * 100) : 0,
      },
    });
  } catch (err) { next(err); }
});

// ── Product stock history ────────────────────────────────────────────────────
// The In/Out breakdown and the movement ledger for one product (optionally
// pinned to a variant and/or location) — the reference's drill-down.
router.get('/stock-history', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const productId = req.query.product_id || null;
    const variantId = req.query.variant_id || null;
    const loc = req.query.location_id || null;
    if (!productId || !PL_UUID_RE.test(productId)) {
      return res.status(400).json({ title: 'product_id is required and must be a UUID.', status: 400 });
    }
    for (const [k, v] of [['variant_id', variantId], ['location_id', loc]]) {
      if (v && !(typeof v === 'string' && PL_UUID_RE.test(v))) {
        return res.status(400).json({ title: `${k} must be a UUID.`, status: 400 });
      }
    }
    const product = await prisma.product.findFirst({ where: { id: productId, businessId: bizId }, select: { id: true, name: true, unitOfMeasure: true } });
    if (!product) return res.status(404).json({ title: 'Product not found.', status: 404 });

    const where = {
      businessId: bizId, productId,
      ...(variantId && { variantId }),
      ...(loc && { locationId: loc }),
    };
    const [byType, movements, current] = await Promise.all([
      // Signed sums split by type and reference so purchase vs sell returns and
      // transfers land in the right bucket.
      prisma.$queryRaw`
        SELECT type, reference_type, SUM(quantity)::int AS qty
        FROM stock_movements
        WHERE business_id = ${bizId}::uuid AND product_id = ${productId}::uuid
          AND (${variantId}::uuid IS NULL OR variant_id = ${variantId}::uuid)
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
        GROUP BY type, reference_type
      `,
      prisma.stockMovement.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 200,
        include: { location: { select: { name: true } }, createdBy: { select: { name: true } } },
      }),
      // Current stock is pooled per product+location (there is no variant-level
      // stock_levels row), so it is not narrowed by variant.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(quantity), 0)::int AS qty
        FROM stock_levels
        WHERE product_id = ${productId}::uuid
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
      `,
    ]);

    const bucket = { purchase: 0, opening: 0, sell_return: 0, transfer_in: 0, received: 0,
                     sold: 0, adjustment: 0, purchase_return: 0, transfer_out: 0, issued: 0, waste: 0 };
    for (const r of byType) {
      const q = Number(r.qty) || 0;
      if (r.type === 'purchase') bucket.purchase += q;
      else if (r.type === 'opening') bucket.opening += q;
      else if (r.type === 'transfer_in') bucket.transfer_in += q;
      else if (r.type === 'in') bucket.received += q;               // generic inflow (e.g. pharmacy batch)
      else if (r.type === 'transfer_out') bucket.transfer_out += Math.abs(q);
      else if (r.type === 'sale') bucket.sold += Math.abs(q);
      else if (r.type === 'out') bucket.issued += Math.abs(q);      // generic outflow (dispense/issue)
      else if (r.type === 'waste') bucket.waste += Math.abs(q);
      else if (r.type === 'adjustment') bucket.adjustment += q;     // net; may be + or −
      else if (r.type === 'return') {
        if (r.reference_type === 'purchase_return') bucket.purchase_return += Math.abs(q);
        else bucket.sell_return += q;                              // customer return restocks
      }
    }

    res.json({
      product: { id: product.id, name: product.name, unit: product.unitOfMeasure || 'unit' },
      quantities_in: {
        total_purchase: bucket.purchase,
        opening_stock: bucket.opening,
        total_sell_return: bucket.sell_return,
        stock_transfers_in: bucket.transfer_in,
        total_received: bucket.received,
      },
      quantities_out: {
        total_sold: bucket.sold,
        total_stock_adjustment: Math.abs(bucket.adjustment),
        total_purchase_return: bucket.purchase_return,
        stock_transfers_out: bucket.transfer_out,
        total_issued: bucket.issued,
        total_waste: bucket.waste,
      },
      current_stock: Number(current[0]?.qty || 0),
      movements: movements.map(m => ({
        id: m.id, type: m.type, quantity: m.quantity, balance_after: m.balanceAfter,
        date: m.createdAt, reference_type: m.referenceType, notes: m.notes,
        location: m.location?.name || '', by: m.createdBy?.name || '',
      })),
      limited: movements.length === 200,
    });
  } catch (err) { next(err); }
});

module.exports = router;
