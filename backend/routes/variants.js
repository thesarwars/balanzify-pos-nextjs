const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ProductVariantSchema } = require('../validation/schemas');
const router = express.Router({ mergeParams: true });

router.get('/', auth, async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.productId }, select: { businessId: true } });
    if (!product || product.businessId !== req.user.business_id) return res.status(404).json({ title: 'Product not found', status: 404 });
    const variants = await prisma.productVariant.findMany({
      where: { productId: req.params.productId },
      include: { stockLevels: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const enriched = variants.map(v => ({
      ...v,
      total_stock: v.stockLevels.reduce((s, sl) => s + sl.quantity, 0),
    }));
    res.json({ variants: enriched });
  } catch (err) { next(err); }
});

router.post('/', auth, requireRole('owner', 'manager'), validate(ProductVariantSchema), async (req, res, next) => {
  try {
    const { sku, barcode, attributes, cost_price, selling_price, wholesale_price, is_active, sort_order, opening_stock, location_id } = req.body;
    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product || product.businessId !== req.user.business_id) return res.status(404).json({ title: 'Product not found', status: 404 });

    const variant = await prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.create({
        data: {
          productId: req.params.productId,
          sku: sku || null,
          barcode: barcode || null,
          attributes: attributes || {},
          costPrice: cost_price || 0,
          sellingPrice: selling_price || parseFloat(product.sellingPrice),
          wholesalePrice: wholesale_price || 0,
          isActive: is_active ?? true,
          sortOrder: sort_order || 0,
        },
      });
      if (opening_stock > 0 && location_id) {
        await tx.$executeRaw`
          INSERT INTO stock_levels (product_id, variant_id, location_id, quantity)
          VALUES (${req.params.productId}::uuid, ${v.id}::uuid, ${location_id}::uuid, ${opening_stock})
          ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = stock_levels.quantity + ${opening_stock}
        `;
      }
      return v;
    });
    res.status(201).json(variant);
  } catch (err) { next(err); }
});

router.put('/:variantId', auth, requireRole('owner', 'manager'), validate(ProductVariantSchema.partial()), async (req, res, next) => {
  try {
    const { sku, barcode, attributes, cost_price, selling_price, wholesale_price, is_active, sort_order } = req.body;
    const variant = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data: {
        ...(sku !== undefined && { sku }),
        ...(barcode !== undefined && { barcode }),
        ...(attributes && { attributes }),
        ...(cost_price !== undefined && { costPrice: cost_price }),
        ...(selling_price !== undefined && { sellingPrice: selling_price }),
        ...(wholesale_price !== undefined && { wholesalePrice: wholesale_price }),
        ...(is_active !== undefined && { isActive: is_active }),
        ...(sort_order !== undefined && { sortOrder: sort_order }),
      },
    });
    res.json(variant);
  } catch (err) { next(err); }
});

router.delete('/:variantId', auth, requireRole('owner'), async (req, res, next) => {
  try {
    await prisma.productVariant.update({ where: { id: req.params.variantId }, data: { isActive: false } });
    res.json({ message: 'Variant archived.' });
  } catch (err) { next(err); }
});

module.exports = router;
