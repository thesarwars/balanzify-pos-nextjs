const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ProductSchema } = require('../validation/schemas');
const router = express.Router();

// ==========================================
// GET / - List Products with Pagination & Filters
// ==========================================
router.get('/', auth, async (req, res, next) => {
  try {
    const { page = 1, limit = 100, search, category_id, is_active, low_stock } = req.query;
    
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
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true, color: true } },
        stockLevels: { include: { location: { select: { name: true } } } },
        variants: { where: { isActive: true }, select: { id: true, attributes: true, sellingPrice: true } },
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
        stockLevels: { include: { location: true } },
        variants: { where: { isActive: true } },
        stockBatches: { orderBy: { expiryDate: 'asc' } },
      },
    });

    if (!product || product.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Product not found', status: 404 });
    }

    res.json({ 
      ...product, 
      total_stock: product.stockLevels.reduce((s, sl) => s + sl.quantity, 0) 
    });
  } catch (err) { 
    next(err); 
  }
});

// ==========================================
// POST / - Create a Product & Initialize Stock
// ==========================================
router.post('/', auth, requireRole('owner', 'manager'), validate(ProductSchema), async (req, res, next) => {
  try {
    const { opening_stock, location_id, ...data } = req.body;

    const product = await prisma.$transaction(async (tx) => {
      // 1. Create the base product record
      const p = await tx.product.create({
        data: {
          businessId: req.user.business_id,
          name: data.name,
          sku: data.sku || null,
          barcode: data.barcode || null,
          description: data.description || null,
          categoryId: data.category_id || null,
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
      opening_stock, location_id, category_id, unit_of_measure, cost_price, selling_price,
      wholesale_price, min_stock_level, max_stock_level, reorder_point, track_expiry,
      allow_price_override, is_active, ...rest 
    } = req.body;

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(category_id !== undefined && { categoryId: category_id }),
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

module.exports = router;