/**
 * Public Shop Routes — the consumer ordering side. No app, no account.
 *
 * A customer opens a link (or a WhatsApp catalog), sees what the shop sells, and
 * places a delivery order. No login: these endpoints are public, scoped to one
 * business, and only live when that business has licensed the delivery module.
 * The order lands as a `pending` delivery in the merchant's dispatch board, which
 * auto-matches a driver. Prices and totals are computed SERVER-SIDE from the
 * catalog — the consumer never sets them.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { resolveEnabled } = require('../lib/modules');
const { validate } = require('../middleware/validate');

const router = express.Router();

// A business is "open for orders" only if it exists and has delivery enabled.
async function openShop(businessId) {
  if (!/^[0-9a-f-]{36}$/i.test(businessId || '')) return null;
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, currency: true, enabledModules: true },
  });
  if (!biz) return null;
  return resolveEnabled(biz.enabledModules).has('delivery') ? biz : null;
}

// Browse the shop's catalog.
router.get('/:businessId/catalog', async (req, res, next) => {
  try {
    const biz = await openShop(req.params.businessId);
    if (!biz) return res.status(404).json({ title: 'Shop not found or not accepting orders', status: 404 });
    const products = await prisma.product.findMany({
      where: { businessId: biz.id, isActive: true },
      select: { id: true, name: true, sellingPrice: true, unitOfMeasure: true, imageUrl: true },
      orderBy: { name: 'asc' }, take: 500,
    });
    res.json({
      shop: { id: biz.id, name: biz.name, currency: biz.currency || 'USD' },
      products: products.map(p => ({ id: p.id, name: p.name, price: parseFloat(p.sellingPrice), unit: p.unitOfMeasure, image: p.imageUrl || null })),
    });
  } catch (err) { next(err); }
});

// Place a delivery order.
router.post('/:businessId/order', validate(z.object({
  customer_name: z.string().trim().min(1).max(255),
  phone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().min(1),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.coerce.number().int().positive().max(999) })).min(1).max(100),
  note: z.string().max(500).optional().nullable(),
})), async (req, res, next) => {
  try {
    const biz = await openShop(req.params.businessId);
    if (!biz) return res.status(404).json({ title: 'Shop not found or not accepting orders', status: 404 });

    const ids = [...new Set(req.body.items.map(i => i.product_id))];
    const prods = await prisma.product.findMany({ where: { businessId: biz.id, id: { in: ids }, isActive: true }, select: { id: true, name: true, sellingPrice: true } });
    const byId = Object.fromEntries(prods.map(p => [p.id, p]));

    let amount = 0; const lines = [];
    for (const it of req.body.items) {
      const p = byId[it.product_id];
      if (!p) continue; // silently drop unknown/inactive items
      amount += parseFloat(p.sellingPrice) * it.quantity;
      lines.push(`${it.quantity}× ${p.name}`);
    }
    if (!lines.length) return res.status(400).json({ title: 'None of the ordered items are available', status: 400 });

    const delivery = await prisma.delivery.create({
      data: {
        businessId: biz.id, customerName: req.body.customer_name, customerPhone: req.body.phone || null,
        address: req.body.address, channel: 'web', itemsSummary: lines.join(', '),
        orderAmount: +amount.toFixed(2), deliveryFee: 0, paymentMode: 'cod', status: 'pending',
      },
    });
    res.status(201).json({ order_id: delivery.id, status: delivery.status, order_amount: parseFloat(delivery.orderAmount), items: lines });
  } catch (err) { next(err); }
});

// Track an order (public, by its unguessable id).
router.get('/order/:id/status', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id || '')) return res.status(404).json({ title: 'Order not found', status: 404 });
    const d = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, customerName: true, orderAmount: true, itemsSummary: true, createdAt: true, deliveredAt: true },
    });
    if (!d) return res.status(404).json({ title: 'Order not found', status: 404 });
    res.json({ order_id: d.id, status: d.status, customer: d.customerName, amount: parseFloat(d.orderAmount), items: d.itemsSummary, placed_at: d.createdAt, delivered_at: d.deliveredAt });
  } catch (err) { next(err); }
});

module.exports = router;
