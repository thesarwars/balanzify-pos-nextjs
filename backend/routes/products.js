const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ProductSchema, OpeningStockSchema } = require('../validation/schemas');
const router = express.Router();

// ==========================================
// GET / - List Products with Pagination & Filters
// ==========================================
router.get('/', auth, async (req, res, next) => {
  try {
    const { page = 1, limit = 100, search, category_id, is_active, low_stock, sellable } = req.query;

    const where = {
      businessId: req.user.business_id,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(category_id && { categoryId: category_id }),
      ...(is_active !== undefined && { isActive: is_active === 'true' }),
      // POS: exclude items flagged "not for selling" (raw materials, internal use).
      ...(sellable === '1' && { notForSelling: false }),
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true, color: true } },
        brand: { select: { name: true } },
        stockLevels: { include: { location: { select: { name: true } } } },
        variants: { where: { isActive: true }, select: { id: true, attributes: true, sellingPrice: true, costPrice: true, sku: true } },
      },
      orderBy: { name: 'asc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });

    // Compute total_stock and variant flags per product
    const enriched = products.map(p => ({
      ...p,
      total_stock: p.stockLevels.reduce((s, sl) => s + sl.quantity, 0),
      has_variants: p.variants.length > 0,
    }));

    if (low_stock === 'true') {
      return res.json({ 
        products: enriched.filter(p => p.total_stock <= p.reorderPoint && p.reorderPoint > 0) 
      });
    }

    res.json({ products: enriched });
  } catch (err) { 
    next(err); 
  }
});

// ==========================================
// GET /:id - Fetch a Single Product by ID
// ==========================================
router.get('/:id', auth, async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        brand: { select: { name: true } },
        stockLevels: { include: { location: true } },
        variants: { where: { isActive: true } },
        stockBatches: { orderBy: { expiryDate: 'asc' } },
      },
    });

    if (!product || product.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Product not found', status: 404 });
    }

    // Stock details broken down by variation × location, valued at the real cost
    // basis (cost layers, which are per-variant). Falls back to the pooled stock
    // level valued at the product cost for products with no cost layers.
    const layers = await prisma.costLayer.findMany({
      where: { productId: product.id, quantityRemaining: { gt: 0 } },
      select: { variantId: true, locationId: true, quantityRemaining: true, unitCost: true },
    });
    let stockDetails;
    if (layers.length) {
      const map = new Map();
      for (const l of layers) {
        const key = `${l.variantId || ''}:${l.locationId || ''}`;
        const row = map.get(key) || { variant_id: l.variantId, location_id: l.locationId, quantity: 0, value: 0 };
        row.quantity += l.quantityRemaining;
        row.value += l.quantityRemaining * Number(l.unitCost);
        map.set(key, row);
      }
      stockDetails = [...map.values()].map((r) => ({ ...r, value: +r.value.toFixed(2) }));
    } else {
      const cost = Number(product.costPrice || 0);
      stockDetails = product.stockLevels
        .filter((sl) => sl.quantity > 0)
        .map((sl) => ({ variant_id: sl.variantId || null, location_id: sl.locationId, quantity: sl.quantity, value: +(sl.quantity * cost).toFixed(2) }));
    }

    res.json({
      ...product,
      total_stock: product.stockLevels.reduce((s, sl) => s + sl.quantity, 0),
      stock_details: stockDetails,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// POST / - Create a Product & Initialize Stock
// ==========================================
// Catalog-profile fields (reference product form) → Prisma columns; only maps
// keys present so PUT stays partial.
function productProfileData(b) {
  const d = {};
  if (b.barcode_type           !== undefined) d.barcodeType = b.barcode_type;
  if (b.weight                 !== undefined) d.weight = b.weight;
  if (b.prep_time_minutes      !== undefined) d.prepTimeMinutes = b.prep_time_minutes;
  if (b.not_for_selling        !== undefined) d.notForSelling = b.not_for_selling;
  if (b.enable_stock           !== undefined) d.enableStock = b.enable_stock;
  if (b.selling_price_tax_type !== undefined) d.sellingPriceTaxType = b.selling_price_tax_type;
  if (b.tax_rate_id            !== undefined) d.taxRateId = b.tax_rate_id || null;
  if (b.is_serialized          !== undefined) d.isSerialized = b.is_serialized;
  if (b.brochure_url           !== undefined) d.brochureUrl = b.brochure_url || null;
  if (b.brochure_key           !== undefined) d.brochureKey = b.brochure_key || null;
  if (b.location_ids           !== undefined) d.locationIds = b.location_ids || [];
  if (b.tile_color             !== undefined) d.tileColor = b.tile_color || null;
  return d;
}

// Cross-tenant guard for catalog references.
async function invalidProductRef(b, businessId) {
  if (b.tax_rate_id && !(await prisma.taxRate.count({ where: { id: b.tax_rate_id, businessId } }))) return 'Tax rate not found';
  const locs = Array.isArray(b.location_ids) ? [...new Set(b.location_ids)] : [];
  if (locs.length && (await prisma.location.count({ where: { id: { in: locs }, businessId } })) !== locs.length) return 'One or more locations not found';
  return null;
}

router.post('/', auth, requireRole('owner', 'manager'), validate(ProductSchema), async (req, res, next) => {
  try {
    const { opening_stock, location_id, ...data } = req.body;
    const bad = await invalidProductRef(data, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });

    const product = await prisma.$transaction(async (tx) => {
      // 1. Create the base product record
      const p = await tx.product.create({
        data: {
          businessId: req.user.business_id,
          name: data.name,
          // Blank SKU auto-generates a unique one (reference behaviour).
          sku: data.sku || ('SKU-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')),
          barcode: data.barcode || null,
          description: data.description || null,
          categoryId: data.category_id || null,
          brandId: data.brand_id || null,
          unitOfMeasure: data.unit_of_measure || 'unit',
          costPrice: data.cost_price || 0,
          sellingPrice: data.selling_price || 0,
          wholesalePrice: data.wholesale_price || 0,
          minStockLevel: data.min_stock_level || 0,
          maxStockLevel: data.max_stock_level || 0,
          reorderPoint: data.reorder_point || 0,
          trackExpiry: data.track_expiry || false,
          allowPriceOverride: data.allow_price_override ?? true,
          isActive: data.is_active ?? true,
          notes: data.notes || null,
          ...productProfileData(data),
        },
      });

      // 2. Safely initialize stock level and record historic tracking movement
      if (opening_stock !== undefined && opening_stock > 0 && location_id) {
        const qty = parseInt(opening_stock, 10);

        // Native Prisma Upsert avoids raw SQL mapping bugs (PostgreSQL error 23502)
        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: p.id,
              locationId: location_id,
            },
          },
          update: { quantity: qty },
          create: {
            productId: p.id,
            locationId: location_id,
            quantity: qty,
          },
        });

        // Write audit trail entry
        await tx.stockMovement.create({
          data: {
            businessId: req.user.business_id,
            productId: p.id,
            locationId: location_id,
            type: 'opening',
            quantity: qty,
            balanceAfter: qty,
            notes: 'Opening stock',
            createdById: req.user.id,
          },
        });
      }

      return p;
    });

    res.status(201).json(product);
  } catch (err) { 
    next(err); 
  }
});

// ==========================================
// PUT /:id - Update Existing Product Attributes
// ==========================================
router.put('/:id', auth, requireRole('owner', 'manager'), validate(ProductSchema.partial()), async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    
    if (!product || product.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Not found', status: 404 });
    }

    const {
      opening_stock, location_id, category_id, brand_id, unit_of_measure, cost_price, selling_price,
      wholesale_price, min_stock_level, max_stock_level, reorder_point, track_expiry,
      allow_price_override, is_active,
      barcode_type, weight, prep_time_minutes, not_for_selling, enable_stock,
      selling_price_tax_type, tax_rate_id, is_serialized, brochure_url, brochure_key,
      location_ids, tile_color, ...rest
    } = req.body;

    const bad = await invalidProductRef(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...productProfileData(req.body),
        ...(category_id !== undefined && { categoryId: category_id }),
        ...(brand_id !== undefined && { brandId: brand_id }),
        ...(unit_of_measure && { unitOfMeasure: unit_of_measure }),
        ...(cost_price !== undefined && { costPrice: cost_price }),
        ...(selling_price !== undefined && { sellingPrice: selling_price }),
        ...(wholesale_price !== undefined && { wholesalePrice: wholesale_price }),
        ...(min_stock_level !== undefined && { minStockLevel: min_stock_level }),
        ...(max_stock_level !== undefined && { maxStockLevel: max_stock_level }),
        ...(reorder_point !== undefined && { reorderPoint: reorder_point }),
        ...(track_expiry !== undefined && { trackExpiry: track_expiry }),
        ...(allow_price_override !== undefined && { allowPriceOverride: allow_price_override }),
        ...(is_active !== undefined && { isActive: is_active }),
      },
    });

    res.json(updated);
  } catch (err) { 
    next(err); 
  }
});

// ==========================================
// DELETE /:id - Archive Product (Soft Delete)
// ==========================================
router.delete('/:id', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    
    if (!product || product.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Not found', status: 404 });
    }

    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ message: 'Product archived successfully.' });
  } catch (err) { 
    next(err); 
  }
});

// ==========================================
// GET /:id/movements - Fetch Product Audit Log
// ==========================================
router.get('/:id/movements', auth, async (req, res, next) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      where: { 
        productId: req.params.id, 
        businessId: req.user.business_id 
      },
      include: {
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ movements });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// POST /:id/opening-stock - Add opening stock at a location
// ==========================================
// Stock is pooled per (product, location) — the app's inventory granularity —
// so the line quantities sum into one stock level, while cost basis (cost
// layers) and the audit trail (movements) are recorded per line, honouring the
// variant when given. Additive: adding opening stock increases the balance.
router.post('/:id/opening-stock', auth, requireRole('owner', 'manager'), validate(OpeningStockSchema), async (req, res, next) => {
  try {
    const { location_id, lines } = req.body;
    const product = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!product) return res.status(404).json({ title: 'Product not found', status: 404 });
    if (!(await prisma.location.count({ where: { id: location_id, businessId: req.user.business_id } }))) {
      return res.status(400).json({ title: 'Location not found', status: 400 });
    }
    // Variant lines must belong to this product.
    const variantIds = [...new Set(lines.map((l) => l.variant_id).filter(Boolean))];
    if (variantIds.length && (await prisma.productVariant.count({ where: { id: { in: variantIds }, productId: product.id } })) !== variantIds.length) {
      return res.status(400).json({ title: 'One or more variations do not belong to this product', status: 400 });
    }

    const totalQty = lines.reduce((s, l) => s + (l.quantity || 0), 0);
    const costSum = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unit_cost || 0), 0);
    const wtCost = totalQty > 0 ? +(costSum / totalQty).toFixed(4) : 0;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Pooled stock level (product, location) — additive.
      const level = await tx.stockLevel.upsert({
        where: { productId_locationId: { productId: product.id, locationId: location_id } },
        update: { quantity: { increment: totalQty } },
        create: { productId: product.id, locationId: location_id, quantity: totalQty },
      });
      // 2. Per-line cost layer + audit movement (keeps the variant where given).
      for (const l of lines) {
        if (!l.quantity || l.quantity <= 0) continue;
        await tx.costLayer.create({ data: {
          businessId: req.user.business_id, productId: product.id, variantId: l.variant_id || null,
          locationId: location_id, quantityReceived: l.quantity, quantityRemaining: l.quantity, unitCost: l.unit_cost || 0,
        } });
        await tx.stockMovement.create({ data: {
          businessId: req.user.business_id, productId: product.id, variantId: l.variant_id || null,
          locationId: location_id, type: 'opening', quantity: l.quantity, balanceAfter: level.quantity,
          notes: l.note || 'Opening stock', createdById: req.user.id,
        } });
      }
      // 3. Seed the product's cost price if it had none.
      if (wtCost > 0 && Number(product.costPrice) === 0) {
        await tx.product.update({ where: { id: product.id }, data: { costPrice: wtCost } });
      }
      return level;
    });

    res.status(201).json({ message: 'Opening stock added.', quantity_added: totalQty, total_quantity: result.quantity });
  } catch (err) { next(err); }
});

module.exports = router;