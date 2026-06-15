const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z } = require('zod');
const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const counts = await prisma.stockCount.findMany({
      where: { businessId: req.user.business_id },
      include: {
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ counts });
  } catch (err) { next(err); }
});

router.get('/reorder/suggestions', auth, async (req, res, next) => {
  try {
    // Compute reorder suggestions on the fly
    const products = await prisma.product.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: {
        stockLevels: { include: { location: true } },
        supplierProducts: {
          where: { isPreferred: true },
          include: { supplier: { select: { id: true, name: true, whatsapp: true } } },
          take: 1,
        },
      },
    });

    const suggestions = products
      .filter(p => {
        const total = p.stockLevels.reduce((s, sl) => s + sl.quantity, 0);
        return p.reorderPoint > 0 && total <= p.reorderPoint;
      })
      .map(p => {
        const total = p.stockLevels.reduce((s, sl) => s + sl.quantity, 0);
        const preferred = p.supplierProducts[0];
        const suggestedQty = Math.max(p.reorderPoint * 2 - total, 1);
        return {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          current_stock: total,
          reorder_point: p.reorderPoint,
          suggested_qty: suggestedQty,
          preferred_supplier: preferred?.supplier || null,
          unit_price: preferred?.unitPrice || p.costPrice,
          estimated_cost: suggestedQty * parseFloat(preferred?.unitPrice || p.costPrice),
        };
      });

    res.json({ suggestions });
  } catch (err) { next(err); }
});

router.post('/reorder/create-po', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const { items, supplier_id, location_id } = req.body;
    if (!items?.length || !supplier_id) return res.status(400).json({ title: 'items and supplier_id required', status: 400 });
    const subtotal = items.reduce((s, i) => s + (i.unit_price || 0) * i.qty, 0);
    const po = await prisma.purchaseOrder.create({
      data: {
        businessId: req.user.business_id,
        supplierId: supplier_id,
        locationId: location_id || null,
        poNumber: `PO-${Date.now()}`,
        subtotal,
        totalAmount: subtotal,
        createdById: req.user.id,
        items: {
          create: items.map(item => ({
            productId: item.product_id,
            orderedQty: item.qty,
            unitPrice: item.unit_price || 0,
            totalPrice: (item.unit_price || 0) * item.qty,
          })),
        },
      },
      include: { items: true },
    });
    res.status(201).json(po);
  } catch (err) { next(err); }
});

router.post('/', auth, validate(z.object({
  location_id: z.string().uuid().optional(),
  name: z.string().max(255).optional(),
  type: z.enum(['full', 'partial', 'cycle']).default('full'),
})), async (req, res, next) => {
  try {
    const { location_id, name, type } = req.body;
    const count = await prisma.$transaction(async (tx) => {
      const newCount = await tx.stockCount.create({
        data: {
          businessId: req.user.business_id,
          locationId: location_id || null,
          name: name || `Stocktake ${new Date().toLocaleDateString()}`,
          type,
          createdById: req.user.id,
        },
      });

      // Populate with current stock levels
      const stockLevels = await tx.stockLevel.findMany({
        where: {
          product: { businessId: req.user.business_id, isActive: true },
          ...(location_id && { locationId: location_id }),
        },
        include: { product: { select: { name: true } } },
      });

      if (stockLevels.length) {
        await tx.stockCountItem.createMany({
          data: stockLevels.map(sl => ({
            countId: newCount.id,
            productId: sl.productId,
            systemQty: sl.quantity,
          })),
        });
      }
      return newCount;
    });
    res.status(201).json(count);
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const count = await prisma.stockCount.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          include: { product: { select: { name: true, sku: true, barcode: true } }, countedBy: { select: { name: true } } },
        },
        location: { select: { name: true } },
      },
    });
    if (!count || count.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(count);
  } catch (err) { next(err); }
});

router.put('/:id/items/:itemId', auth, validate(z.object({ counted_qty: z.coerce.number().int().nonnegative() })), async (req, res, next) => {
  try {
    const item = await prisma.stockCountItem.update({
      where: { id: req.params.itemId },
      data: { countedQty: req.body.counted_qty, countedById: req.user.id, countedAt: new Date() },
    });
    res.json(item);
  } catch (err) { next(err); }
});

router.post('/:id/approve', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const count = await prisma.stockCount.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!count || count.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (count.status !== 'completed') return res.status(400).json({ title: 'Count must be completed before approval', status: 400 });

    await prisma.$transaction(async (tx) => {
      for (const item of count.items) {
        if (item.countedQty == null || item.systemQty === item.countedQty) continue;
        const diff = item.countedQty - item.systemQty;
        if (count.locationId) {
          await tx.$executeRaw`
            INSERT INTO stock_levels (id, product_id, location_id, quantity)
            VALUES (gen_random_uuid(), ${item.productId}::uuid, ${count.locationId}::uuid, ${item.countedQty})
            ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = ${item.countedQty}, updated_at = NOW()
          `;
          await tx.stockMovement.create({
            data: {
              businessId: req.user.business_id,
              productId: item.productId,
              locationId: count.locationId,
              type: 'adjustment',
              quantity: diff,
              balanceAfter: item.countedQty,
              notes: `Stocktake variance: ${diff > 0 ? '+' : ''}${diff}`,
              createdById: req.user.id,
            },
          });
        }
      }
      await tx.stockCount.update({
        where: { id: req.params.id },
        data: { status: 'approved', approvedById: req.user.id, approvedAt: new Date() },
      });
    });
    res.json({ message: 'Stocktake approved and stock levels updated.' });
  } catch (err) { next(err); }
});

module.exports = router;
