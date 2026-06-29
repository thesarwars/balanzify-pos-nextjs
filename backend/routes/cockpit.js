/**
 * Merchant daily cockpit — the one screen a merchant opens every morning.
 *
 * Assembles the day-one questions into a single read:
 *   • Money in today        — completed sales (count + total)
 *   • Who owes me (deyn)     — total receivable + top debtors
 *   • Money coming in        — diaspora payments awaiting confirmation
 *   • What to reorder        — products at/below their reorder point
 *   • Today's briefing       — the AI assistant's plain-language summary
 *                              (deterministic fallback when no LLM key)
 *
 * Fully functional with no external service. GET /api/v1/cockpit
 */
const express = require('express');
const prisma  = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const insights = require('../lib/insights');
const { logger } = require('../lib/logger');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

    const [salesToday, topDebtors, receivableAgg, diaspora, reorderRows] = await Promise.all([
      prisma.sale.aggregate({
        where: { businessId, status: 'completed', createdAt: { gte: startOfDay } },
        _sum: { totalAmount: true }, _count: true,
      }),
      prisma.customer.findMany({
        where: { businessId, outstandingBalance: { gt: 0 } },
        select: { id: true, name: true, phone: true, outstandingBalance: true },
        orderBy: { outstandingBalance: 'desc' }, take: 5,
      }),
      prisma.customer.aggregate({
        where: { businessId, outstandingBalance: { gt: 0 } },
        _sum: { outstandingBalance: true }, _count: true,
      }),
      prisma.diasporaPayment.aggregate({
        where: { businessId, status: { in: ['pending', 'processing'] } },
        _sum: { amount: true }, _count: true,
      }),
      // Stock at/below its reorder point (reorderPoint 0 means "not tracked").
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM stock_levels sl
        JOIN products p ON p.id = sl.product_id
        WHERE p.business_id = ${businessId}::uuid
          AND p.reorder_point > 0
          AND sl.quantity <= p.reorder_point
      `,
    ]);

    // The briefing is best-effort — never let it sink the cockpit.
    let briefing = null;
    try {
      briefing = await insights.generateDailyBriefing(businessId);
    } catch (err) {
      logger.error('cockpit_briefing_error', { message: err.message });
    }

    const currency = req.user.currency || 'USD';

    res.json({
      as_of: new Date(),
      currency,
      money_in_today: {
        total: parseFloat(salesToday._sum.totalAmount || 0),
        sales_count: salesToday._count || 0,
      },
      receivables: {
        total_owed: parseFloat(receivableAgg._sum.outstandingBalance || 0),
        debtor_count: receivableAgg._count || 0,
        top_debtors: topDebtors.map(c => ({
          id: c.id, name: c.name, phone: c.phone, balance: parseFloat(c.outstandingBalance),
        })),
      },
      diaspora_incoming: {
        count: diaspora._count || 0,
        total: parseFloat(diaspora._sum.amount || 0),
      },
      reorder_due: reorderRows[0]?.n || 0,
      briefing: briefing ? {
        text: briefing.briefing,
        urgent: briefing.urgent || [],
        mode: briefing.mode,
      } : null,
    });
  } catch (err) { next(err); }
});

module.exports = router;
