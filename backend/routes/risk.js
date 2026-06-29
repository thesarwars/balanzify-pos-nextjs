/**
 * Risk / anomaly detection.
 *
 * Flags transactions that deviate from the merchant's OWN baseline — unusually
 * large sales, heavy discounts, and refund spikes. Rule-based and fully functional
 * with no external service (the deterministic floor); the same surface upgrades to
 * an ML scorer later without changing the API. Protects the lending book and the
 * future settlement float, where this becomes essential.
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/anomalies', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const days        = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 180);
    const largeFactor = Math.min(Math.max(parseFloat(req.query.large_factor) || 5, 2), 50);
    const since       = new Date(Date.now() - days * 24 * 3600 * 1000);

    const sales = await prisma.sale.findMany({
      where: { businessId, status: 'completed', createdAt: { gte: since } },
      select: { id: true, saleNumber: true, totalAmount: true, subtotal: true, discountAmount: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 2000,
    });
    if (sales.length < 3) {
      return res.json({ window_days: days, baseline: null, anomalies: [], note: 'Not enough sales history to baseline yet.' });
    }

    // Median is robust to the very outliers we're hunting for.
    const totals = sales.map(s => parseFloat(s.totalAmount)).sort((a, b) => a - b);
    const median = totals[Math.floor(totals.length / 2)];

    const anomalies = [];
    for (const s of sales) {
      const total = parseFloat(s.totalAmount);
      const sub   = parseFloat(s.subtotal || total);
      const disc  = parseFloat(s.discountAmount || 0);
      if (median > 0 && total > median * largeFactor) {
        anomalies.push({ type: 'large_sale', severity: 'review', sale_id: s.id, ref: s.saleNumber, amount: total,
          detail: `${total} is ${(total / median).toFixed(1)}× the median sale (${median.toFixed(2)})` });
      }
      if (sub > 0 && disc / sub >= 0.5) {
        anomalies.push({ type: 'high_discount', severity: 'review', sale_id: s.id, ref: s.saleNumber, amount: total,
          detail: `${Math.round((disc / sub) * 100)}% discount applied` });
      }
    }

    // Refund-rate spike across the window.
    const [refundAgg, refundRows] = await Promise.all([
      prisma.refund.aggregate({ where: { businessId, createdAt: { gte: since } }, _sum: { totalRefunded: true }, _count: true }),
      prisma.refund.findMany({ where: { businessId, createdAt: { gte: since } }, select: { totalRefunded: true } }),
    ]);
    const salesTotal = totals.reduce((a, b) => a + b, 0);
    const refundTotal = parseFloat(refundAgg._sum.totalRefunded || 0);
    const refundRatePct = salesTotal > 0 ? +((refundTotal / salesTotal) * 100).toFixed(1) : 0;
    if (refundRatePct > 10 && refundRows.length >= 2) {
      anomalies.push({ type: 'refund_spike', severity: 'investigate', amount: refundTotal,
        detail: `Refunds are ${refundRatePct}% of sales (${refundRows.length} refunds)` });
    }

    res.json({
      window_days: days,
      baseline: { sales: sales.length, median_ticket: +median.toFixed(2), refund_rate_pct: refundRatePct },
      anomaly_count: anomalies.length,
      anomalies,
    });
  } catch (err) { next(err); }
});

module.exports = router;
