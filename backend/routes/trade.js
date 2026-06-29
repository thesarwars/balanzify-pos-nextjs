/**
 * B2B trade rails — merchant-to-merchant orders between on-platform businesses.
 *
 * The network-liquidity play: a distributor and the dukas it supplies both run on
 * the same system, so an order placed by the buyer and accepted by the seller
 * posts to BOTH ledgers at once — the seller books a receivable against revenue,
 * the buyer books inventory against a payable. The platform sees both sides of
 * the trade, which is exactly the data that sharpens underwriting.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
const uuid = z.string().uuid();

// Browse a seller's wholesale catalog (you must know the seller's business id).
router.get('/suppliers/:sellerId/catalog', auth, async (req, res, next) => {
  try {
    const seller = await prisma.business.findUnique({ where: { id: req.params.sellerId }, select: { id: true, name: true } });
    if (!seller) return res.status(404).json({ title: 'Supplier not found', status: 404 });
    const products = await prisma.product.findMany({
      where: { businessId: seller.id, isActive: true },
      select: { id: true, name: true, wholesalePrice: true, sellingPrice: true }, orderBy: { name: 'asc' }, take: 500,
    });
    res.json({
      supplier: { id: seller.id, name: seller.name },
      products: products.map(p => ({ id: p.id, name: p.name, price: parseFloat(p.wholesalePrice) > 0 ? parseFloat(p.wholesalePrice) : parseFloat(p.sellingPrice) })),
    });
  } catch (err) { next(err); }
});

// Place an order to a seller business (the caller is the buyer).
router.post('/orders', auth, requireRole('owner', 'manager'), validate(z.object({
  seller_business_id: uuid,
  note: z.string().max(300).optional(),
  items: z.array(z.object({ product_id: uuid, quantity: z.coerce.number().int().positive() })).min(1),
})), async (req, res, next) => {
  try {
    const buyerBusinessId = req.user.business_id;
    if (req.body.seller_business_id === buyerBusinessId) return res.status(400).json({ title: 'Cannot trade with yourself', status: 400 });
    const seller = await prisma.business.findUnique({ where: { id: req.body.seller_business_id }, select: { id: true } });
    if (!seller) return res.status(404).json({ title: 'Supplier not found', status: 404 });

    const prods = await prisma.product.findMany({ where: { id: { in: req.body.items.map(i => i.product_id) }, businessId: seller.id }, select: { id: true, name: true, wholesalePrice: true, sellingPrice: true } });
    if (prods.length !== new Set(req.body.items.map(i => i.product_id)).size) return res.status(400).json({ title: 'Unknown product in the supplier catalog', status: 400 });
    const byId = Object.fromEntries(prods.map(p => [p.id, p]));

    const lines = req.body.items.map(i => {
      const p = byId[i.product_id];
      const price = parseFloat(p.wholesalePrice) > 0 ? parseFloat(p.wholesalePrice) : parseFloat(p.sellingPrice);
      return { productId: i.product_id, productName: p.name, quantity: i.quantity, unitPrice: price, lineTotal: +(price * i.quantity).toFixed(2) };
    });
    const total = +lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2);
    const order = await prisma.tradeOrder.create({
      data: { sellerBusinessId: seller.id, buyerBusinessId, orderNumber: `TRD-${Date.now()}`, total, note: req.body.note || null, createdById: req.user.id, items: { create: lines } },
      include: { items: true },
    });
    res.status(201).json(order);
  } catch (err) { next(err); }
});

// Orders I placed (role=buyer, default) or received (role=seller).
router.get('/orders', auth, async (req, res, next) => {
  try {
    const me = req.user.business_id;
    const where = req.query.role === 'seller' ? { sellerBusinessId: me } : { buyerBusinessId: me };
    const orders = await prisma.tradeOrder.findMany({ where: { ...where, ...(req.query.status && { status: String(req.query.status) }) }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ orders });
  } catch (err) { next(err); }
});

// Seller accepts → posts to BOTH ledgers; or rejects.
router.post('/orders/:id/decide', auth, requireRole('owner', 'manager'), validate(z.object({
  decision: z.enum(['accept', 'reject']),
})), async (req, res, next) => {
  try {
    const me = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const order = await tx.tradeOrder.findFirst({ where: { id: req.params.id, sellerBusinessId: me } });
      if (!order) return { code: 404, error: 'Order not found (only the seller can decide)' };
      if (order.status !== 'pending') return { code: 400, error: `Order already ${order.status}` };

      if (req.body.decision === 'reject') {
        const u = await tx.tradeOrder.update({ where: { id: order.id }, data: { status: 'rejected' } });
        return { order: u };
      }
      const total = parseFloat(order.total);
      // Seller's books: a receivable earned against revenue.
      await accounting.postJournal(tx, {
        businessId: order.sellerBusinessId, description: `Trade sale — ${order.orderNumber}`,
        sourceType: 'trade_sale', sourceId: order.id, createdById: req.user.id,
        lines: [
          { code: '1100', debit: total, credit: 0, description: 'Trade receivable' },
          { code: '4000', debit: 0, credit: total, description: 'Trade revenue' },
        ],
      });
      // Buyer's books: inventory received against a payable owed to the seller.
      await accounting.postJournal(tx, {
        businessId: order.buyerBusinessId, description: `Trade purchase — ${order.orderNumber}`,
        sourceType: 'trade_purchase', sourceId: order.id, createdById: req.user.id,
        lines: [
          { code: '1200', debit: total, credit: 0, description: 'Inventory received' },
          { code: '2000', debit: 0, credit: total, description: 'Trade payable' },
        ],
      });
      const u = await tx.tradeOrder.update({ where: { id: order.id }, data: { status: 'accepted' } });
      return { order: u };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.json(out.order);
  } catch (err) { next(err); }
});

module.exports = router;
