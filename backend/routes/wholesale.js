/**
 * Wholesale Routes — Balanzify Wholesale module.
 * The distributor's loop: shop orders → warehouse picks → driver delivers →
 * collect on credit. Self-contained fulfillment lifecycle; payment recording
 * updates paymentStatus (full credit-ledger posting is a follow-up wired by
 * the team against the credit module).
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const accounting = require('../lib/accounting');

const router = express.Router();
const uuid = z.string().uuid();
const num = (n) => `WHO-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random()*99)}`;

// List orders (board view: ?status=pending|picked|out_for_delivery|delivered)
router.get('/orders', auth, async (req, res, next) => {
  try {
    const orders = await prisma.wholesaleOrder.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: req.query.status }) },
      include: { customer: { select: { name: true, phone: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    res.json({ orders });
  } catch (err) { next(err); }
});

// Create order at wholesale prices
router.post('/orders', auth, validate(z.object({
  customer_id: uuid,
  items: z.array(z.object({ product_id: uuid, quantity: z.coerce.number().int().positive() })).min(1),
  delivery_notes: z.string().max(500).optional(),
})), async (req, res, next) => {
  try {
    const prods = await prisma.product.findMany({
      where: { id: { in: req.body.items.map(i => i.product_id) }, businessId: req.user.business_id },
      select: { id: true, wholesalePrice: true, sellingPrice: true },
    });
    if (prods.length !== req.body.items.length) return res.status(400).json({ title: 'Unknown product in order', status: 400 });
    const lines = req.body.items.map(i => {
      const p = prods.find(x => x.id === i.product_id);
      const price = parseFloat(p.wholesalePrice) > 0 ? parseFloat(p.wholesalePrice) : parseFloat(p.sellingPrice);
      return { productId: i.product_id, quantity: i.quantity, unitPrice: price, lineTotal: +(price * i.quantity).toFixed(2) };
    });
    const total = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
    const order = await prisma.wholesaleOrder.create({
      data: {
        businessId: req.user.business_id, customerId: req.body.customer_id,
        orderNumber: num(), subtotal: total, total,
        deliveryNotes: req.body.delivery_notes, createdById: req.user.id,
        items: { create: lines },
      },
      include: { items: true },
    });
    res.status(201).json(order);
  } catch (err) { next(err); }
});

// Pick list for the warehouse
router.get('/orders/:id/pick-list', auth, async (req, res, next) => {
  try {
    const order = await prisma.wholesaleOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { customer: { select: { name: true } }, items: { include: { product: { select: { name: true, sku: true, barcode: true } } } } },
    });
    if (!order) return res.status(404).json({ title: 'Order not found', status: 404 });
    res.json({
      order_number: order.orderNumber, customer: order.customer?.name,
      lines: order.items.map(i => ({ item_id: i.id, product: i.product?.name, sku: i.product?.sku, barcode: i.product?.barcode, quantity: i.quantity, picked: i.picked })),
    });
  } catch (err) { next(err); }
});

// Mark items picked → order picked when all done
router.post('/orders/:id/pick', auth, validate(z.object({
  item_ids: z.array(uuid).min(1),
})), async (req, res, next) => {
  try {
    const order = await prisma.wholesaleOrder.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, include: { items: true } });
    if (!order) return res.status(404).json({ title: 'Order not found', status: 404 });
    // Full pick of the named lines: fulfilledQty = ordered quantity.
    for (const it of order.items.filter(i => req.body.item_ids.includes(i.id))) {
      await prisma.wholesaleOrderItem.update({ where: { id: it.id }, data: { picked: true, fulfilledQty: it.quantity } });
    }
    const remaining = await prisma.wholesaleOrderItem.count({ where: { orderId: order.id, picked: false } });
    if (remaining === 0) await prisma.wholesaleOrder.update({ where: { id: order.id }, data: { status: 'picked', pickedAt: new Date() } });
    res.json({ message: remaining === 0 ? 'Order fully picked' : `${remaining} lines remaining`, fully_picked: remaining === 0 });
  } catch (err) { next(err); }
});

// Partial fulfillment: fulfil specific quantities per line (out-of-stock B2B is the
// norm). Sets the order to 'picked' if everything is fulfilled, else
// 'partially_picked'; the shortfall is a backorder.
router.post('/orders/:id/fulfill', auth, validate(z.object({
  items: z.array(z.object({ item_id: uuid, qty: z.coerce.number().int().min(0) })).min(1),
})), async (req, res, next) => {
  try {
    const order = await prisma.wholesaleOrder.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, include: { items: true } });
    if (!order) return res.status(404).json({ title: 'Order not found', status: 404 });
    const byId = Object.fromEntries(order.items.map(i => [i.id, i]));
    for (const f of req.body.items) {
      const it = byId[f.item_id];
      if (!it) continue;
      const fulfilled = Math.min(f.qty, it.quantity); // never over-fulfil a line
      await prisma.wholesaleOrderItem.update({ where: { id: it.id }, data: { fulfilledQty: fulfilled, picked: fulfilled >= it.quantity } });
    }
    const items = await prisma.wholesaleOrderItem.findMany({ where: { orderId: order.id } });
    const allFull = items.every(i => i.fulfilledQty >= i.quantity);
    const anyFull = items.some(i => i.fulfilledQty > 0);
    const status = allFull ? 'picked' : anyFull ? 'partially_picked' : order.status;
    await prisma.wholesaleOrder.update({ where: { id: order.id }, data: { status, ...(allFull && { pickedAt: new Date() }) } });
    const backorder = items.filter(i => i.fulfilledQty < i.quantity).reduce((s, i) => s + (i.quantity - i.fulfilledQty), 0);
    res.json({ status, fully_fulfilled: allFull, backorder_units: backorder });
  } catch (err) { next(err); }
});

// Backorder: the unfulfilled remainder per line.
router.get('/orders/:id/backorder', auth, async (req, res, next) => {
  try {
    const order = await prisma.wholesaleOrder.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order) return res.status(404).json({ title: 'Order not found', status: 404 });
    const lines = order.items.filter(i => i.fulfilledQty < i.quantity)
      .map(i => ({ item_id: i.id, product: i.product?.name || '', ordered: i.quantity, fulfilled: i.fulfilledQty, backorder: i.quantity - i.fulfilledQty }));
    res.json({ order_number: order.orderNumber, backorder: lines, total_backorder_units: lines.reduce((s, l) => s + l.backorder, 0) });
  } catch (err) { next(err); }
});

// Dispatch with driver
router.post('/orders/:id/dispatch', auth, requireRole('owner', 'manager'), validate(z.object({
  driver_name: z.string().min(1).max(120),
})), async (req, res, next) => {
  try {
    const r = await prisma.wholesaleOrder.updateMany({
      // Partially-picked orders can ship too — the shortfall stays on backorder.
      where: { id: req.params.id, businessId: req.user.business_id, status: { in: ['picked', 'partially_picked'] } },
      data: { status: 'out_for_delivery', driverName: req.body.driver_name },
    });
    if (!r.count) return res.status(400).json({ title: 'Order must be picked first', status: 400 });
    res.json({ message: `Dispatched with ${req.body.driver_name}` });
  } catch (err) { next(err); }
});

// Mark delivered
router.post('/orders/:id/deliver', auth, async (req, res, next) => {
  try {
    const delivered = await prisma.$transaction(async (tx) => {
      const order = await tx.wholesaleOrder.findFirst({
        where: { id: req.params.id, businessId: req.user.business_id, status: 'out_for_delivery' },
        include: { items: true },
      });
      if (!order) return null;
      // Bill only what actually shipped: the fulfilled value, not the order total.
      // Backordered units are never invoiced (they ship — and bill — on a later run).
      const fulfilledValue = +order.items
        .reduce((s, i) => s + i.fulfilledQty * parseFloat(i.unitPrice), 0).toFixed(2);
      // Fall back to the order total for legacy orders with no per-line fulfilment.
      const billed = fulfilledValue > 0 ? fulfilledValue : parseFloat(order.total);
      // Re-state the order to the billed value so outstanding/payment math matches the GL.
      await tx.wholesaleOrder.update({ where: { id: order.id }, data: { status: 'delivered', deliveredAt: new Date(), total: billed, subtotal: billed } });
      // GL: delivery recognises revenue on credit — the customer now owes us.
      await accounting.postJournal(tx, {
        businessId:  req.user.business_id,
        description: `Wholesale delivery — ${order.orderNumber || ''}`.trim(),
        sourceType:  'wholesale_delivery', sourceId: order.id, createdById: req.user.id,
        lines: [
          { code: '1100', debit: billed, credit: 0, description: 'Wholesale receivable' },
          { code: '4000', debit: 0, credit: billed, description: 'Wholesale revenue' },
        ],
      });
      return { ...order, billed };
    });
    if (!delivered) return res.status(400).json({ title: 'Order is not out for delivery', status: 400 });
    res.json({ message: 'Delivered. Outstanding balance is collectible.' });
  } catch (err) { next(err); }
});

// Record a payment (cash on delivery or later collection)
router.post('/orders/:id/payment', auth, validate(z.object({
  amount: z.coerce.number().positive(),
})), async (req, res, next) => {
  try {
    const order = await prisma.wholesaleOrder.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!order) return res.status(404).json({ title: 'Order not found', status: 404 });
    // Cap the payment at the outstanding balance.
    const outstanding = +(parseFloat(order.total) - parseFloat(order.amountPaid)).toFixed(2);
    const amount = Math.min(req.body.amount, outstanding);
    if (amount <= 0) return res.status(400).json({ title: 'Order already fully paid', status: 400 });
    const paid = +(parseFloat(order.amountPaid) + amount).toFixed(2);
    const status = paid >= parseFloat(order.total) ? 'paid' : 'partial';
    await prisma.$transaction(async (tx) => {
      await tx.wholesaleOrder.update({ where: { id: order.id }, data: { amountPaid: paid, paymentStatus: status } });
      // GL: collection brings in cash and reduces the wholesale receivable.
      await accounting.postJournal(tx, {
        businessId:  req.user.business_id,
        description: `Wholesale payment — ${order.orderNumber || ''}`.trim(),
        sourceType:  'wholesale_payment', sourceId: order.id, createdById: req.user.id,
        lines: [
          { code: '1000', debit: amount, credit: 0, description: 'Cash collected' },
          { code: '1100', debit: 0, credit: amount, description: 'Wholesale receivable' },
        ],
      });
    });
    res.json({ message: status === 'paid' ? 'Order fully paid' : `Partial payment recorded — ${(parseFloat(order.total) - paid).toFixed(2)} outstanding`, payment_status: status });
  } catch (err) { next(err); }
});

// Outstanding balances per shop customer
router.get('/outstanding', auth, async (req, res, next) => {
  try {
    const open = await prisma.wholesaleOrder.findMany({
      where: { businessId: req.user.business_id, paymentStatus: { in: ['unpaid', 'partial'] }, status: 'delivered' },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
    const byCustomer = {};
    for (const o of open) {
      const k = o.customer?.id || 'unknown';
      if (!byCustomer[k]) byCustomer[k] = { customer: o.customer?.name, phone: o.customer?.phone, orders: 0, outstanding: 0 };
      byCustomer[k].orders += 1;
      byCustomer[k].outstanding = +(byCustomer[k].outstanding + parseFloat(o.total) - parseFloat(o.amountPaid)).toFixed(2);
    }
    res.json({ outstanding: Object.values(byCustomer).sort((a, b) => b.outstanding - a.outstanding) });
  } catch (err) { next(err); }
});

module.exports = router;
