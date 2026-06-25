/**
 * Peer benchmarking — "how do I compare to similar shops?".
 *
 * A data-network-effect feature: the more merchants on the platform, the better
 * everyone's benchmark. Strictly anonymized — only AGGREGATES across many peers
 * are ever returned (and never fewer than MIN_PEERS businesses), so no single
 * competitor's numbers can be inferred. Read-only.
 */
const express = require('express');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');

const router = express.Router();
const MIN_PEERS = 3;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

router.get('/', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const days  = Math.min(Math.max(parseInt(req.query.days) || 30, 7), 180);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const mine = await prisma.sale.aggregate({
      where: { businessId, status: 'completed', createdAt: { gte: since } },
      _avg: { totalAmount: true }, _count: true, _sum: { totalAmount: true },
    });
    const you = {
      sales: mine._count,
      avg_basket: round2(parseFloat(mine._avg.totalAmount || 0)),
      sales_per_day: round2((mine._count || 0) / days),
      revenue: round2(parseFloat(mine._sum.totalAmount || 0)),
    };

    // Per-peer aggregates (every OTHER business), then averaged equally.
    const peers = await prisma.sale.groupBy({
      by: ['businessId'],
      where: { businessId: { not: businessId }, status: 'completed', createdAt: { gte: since } },
      _avg: { totalAmount: true }, _count: true,
    });
    if (peers.length < MIN_PEERS) {
      return res.json({ window_days: days, you, peers_count: peers.length, insufficient_peers: true,
        note: `Benchmarks unlock once at least ${MIN_PEERS} comparable shops are active.` });
    }

    const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const peerAvgBasket = round2(mean(peers.map(p => parseFloat(p._avg.totalAmount || 0))));
    const peerPerDay    = round2(mean(peers.map(p => (p._count || 0) / days)));
    const pct = (mine, peer) => peer > 0 ? Math.round(((mine - peer) / peer) * 100) : null;

    res.json({
      window_days: days,
      you,
      peers: { businesses: peers.length, avg_basket: peerAvgBasket, sales_per_day: peerPerDay },
      comparison: {
        avg_basket_vs_peers_pct: pct(you.avg_basket, peerAvgBasket),
        sales_per_day_vs_peers_pct: pct(you.sales_per_day, peerPerDay),
        basket: you.avg_basket >= peerAvgBasket ? 'above' : 'below',
        volume: you.sales_per_day >= peerPerDay ? 'above' : 'below',
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
