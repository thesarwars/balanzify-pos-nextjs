/**
 * Demand forecasting / predictive reorder.
 *
 * Grounded in the merchant's OWN sales history (stock movements of type 'sale'),
 * not an external model: average daily off-take → days of stock left → a suggested
 * order quantity to hold `cover_days` of stock. Ramadan is surfaced and applies a
 * demand uplift, since off-take spikes for many goods in the launch markets.
 *
 * Read-only. The intelligence the merchant gets for free — and the off-take signal
 * that also sharpens lending underwriting.
 */
const express = require('express');
const prisma = require('../lib/prisma');
const hijri = require('../lib/hijri');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const days       = Math.min(Math.max(parseInt(req.query.days) || 30, 7), 180);
    const coverDays  = Math.min(Math.max(parseInt(req.query.cover_days) || 14, 1), 120);
    const locationId = req.query.location_id || null;
    const tz         = req.query.tz || 'Africa/Nairobi';
    const since      = new Date(Date.now() - days * 24 * 3600 * 1000);

    // Units sold per product in the window (sale movements carry negative qty).
    const sold = await prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { businessId, type: 'sale', createdAt: { gte: since }, ...(locationId && { locationId }) },
      _sum: { quantity: true },
    });
    if (!sold.length) return res.json({ window_days: days, cover_days: coverDays, is_ramadan: hijri.isRamadan(new Date(), tz), items: [] });

    const productIds = sold.map(s => s.productId);
    const [products, levels] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds }, businessId }, select: { id: true, name: true, sku: true } }),
      prisma.stockLevel.findMany({ where: { productId: { in: productIds }, ...(locationId && { locationId }) }, select: { productId: true, quantity: true } }),
    ]);
    const nameById = Object.fromEntries(products.map(p => [p.id, p]));
    const stockById = {};
    for (const l of levels) stockById[l.productId] = (stockById[l.productId] || 0) + l.quantity;

    // Ramadan uplift: hold more cover when off-take is about to spike.
    const isRamadan = hijri.isRamadan(new Date(), tz);
    const seasonal = isRamadan ? 1.5 : 1;

    const items = sold.map(s => {
      const prod = nameById[s.productId];
      if (!prod) return null;
      const unitsSold = Math.abs(parseInt(s._sum.quantity || 0));
      const avgDaily  = +(unitsSold / days).toFixed(3);
      const stock     = stockById[s.productId] || 0;
      const daysLeft  = avgDaily > 0 ? +(stock / avgDaily).toFixed(1) : null;
      const target    = avgDaily * coverDays * seasonal;
      const suggested = Math.max(0, Math.ceil(target - stock));
      return {
        product_id: s.productId, product: prod.name, sku: prod.sku || null,
        units_sold: unitsSold, avg_daily: avgDaily, stock,
        days_left: daysLeft, suggested_qty: suggested,
        urgency: daysLeft != null && daysLeft <= coverDays ? 'reorder' : 'ok',
      };
    }).filter(Boolean);

    // Most urgent first (fewest days of stock left).
    items.sort((a, b) => (a.days_left ?? 1e9) - (b.days_left ?? 1e9));
    res.json({ window_days: days, cover_days: coverDays, is_ramadan: isRamadan, seasonal_multiplier: seasonal, items });
  } catch (err) { next(err); }
});

module.exports = router;
