// Core / legacy reports: sales, inventory, cashier, profit, dashboard,
// revenue-by-category, low-stock, commission and cash-register reports.

const express = require('express');
const prisma = require('../../../lib/prisma');
const commission = require('../../../lib/commission');
const { getBusinessSettings } = require('../../../lib/businessSettings');
const { auth, requireRole } = require('../../../middleware/auth');
const { validate } = require('../../../middleware/validate');
const { CommissionSettingsSchema } = require('../../../validation/schemas');

const router = express.Router();

router.get('/sales', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = {
      businessId: req.user.business_id, status: 'completed',
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
    };
    // Bound by_day with a real Date parameter (never interpolate a conditional
    // SQL fragment into a tagged $queryRaw — it becomes a bound param → syntax error).
    // Business Settings → "Start date" is the earliest data this business has.
    const bset = await getBusinessSettings(req.user.business_id);
    const fromDate = from ? new Date(from) : new Date(bset.start_date || '2000-01-01');
    const [totals, byMethod, byDay] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { totalAmount: true, discountAmount: true }, _count: { id: true }, _avg: { totalAmount: true } }),
      prisma.sale.groupBy({ by: ['paymentMethod'], where, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*)::int as count, SUM(total_amount) as revenue
        FROM sales WHERE business_id = ${req.user.business_id}::uuid AND status = 'completed'
          AND created_at >= ${fromDate}
        GROUP BY DATE(created_at) ORDER BY date
      `,
    ]);
    res.json({ totals, by_method: byMethod, by_day: byDay });
  } catch (err) { next(err); }
});

router.get('/inventory', auth, async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { businessId: req.user.business_id, isActive: true },
      include: { stockLevels: true, category: { select: { name: true } } },
    });
    const report = products.map(p => {
      const stock = p.stockLevels.reduce((s, sl) => s + sl.quantity, 0);
      return { id: p.id, name: p.name, sku: p.sku, category: p.category?.name, stock, reorder_point: p.reorderPoint, cost_price: p.costPrice, selling_price: p.sellingPrice, stock_value: stock * parseFloat(p.costPrice), is_low_stock: stock <= p.reorderPoint && p.reorderPoint > 0 };
    });
    res.json({ products: report, total_value: report.reduce((s, p) => s + parseFloat(p.stock_value), 0) });
  } catch (err) { next(err); }
});

router.get('/cashier', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { businessId: req.user.business_id, status: 'completed', ...(from && { createdAt: { gte: new Date(from) } }), ...(to && { createdAt: { lte: new Date(to) } }) };
    const report = await prisma.sale.groupBy({ by: ['cashierId'], where, _sum: { totalAmount: true }, _count: { id: true }, _avg: { totalAmount: true } });
    const cashiers = await prisma.user.findMany({ where: { id: { in: report.map(r => r.cashierId).filter(Boolean) } }, select: { id: true, name: true } });
    const cashierMap = Object.fromEntries(cashiers.map(c => [c.id, c.name]));
    res.json({ report: report.map(r => ({ cashier: cashierMap[r.cashierId] || 'Unknown', transactions: r._count.id, total: r._sum.totalAmount, avg: r._avg.totalAmount })) });
  } catch (err) { next(err); }
});

router.get('/profit', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = {
      businessId: req.user.business_id,
      status: 'completed',
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to   && { createdAt: { lte: new Date(new Date(to).setDate(new Date(to).getDate() + 1)) } }),
    };

    // Revenue and discount totals
    const totals = await prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true, discountAmount: true, couponDiscount: true, loyaltyDiscount: true, tipAmount: true },
      _count: { id: true },
    });

    // COGS: sum of (cost_price * quantity) from sale_items joined to completed sales
    // Build date bounds for the raw query
    // Business Settings → "Start date" is the earliest data this business has.
    const bset = await getBusinessSettings(req.user.business_id);
    const fromDate = from ? new Date(from) : new Date(bset.start_date || '2000-01-01');
    const toDate   = to   ? new Date(new Date(to).setDate(new Date(to).getDate() + 1)) : new Date('2099-12-31');
    const cogsResult = await prisma.$queryRaw`
      SELECT COALESCE(SUM(si.cost_price * si.quantity), 0) AS cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.business_id = ${req.user.business_id}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
        AND s.created_at <= ${toDate}
    `;

    const revenue = parseFloat(totals._sum.totalAmount || 0);
    const cogs    = parseFloat(cogsResult[0]?.cogs || 0);
    const gross   = revenue - cogs;
    const margin  = revenue > 0 ? (gross / revenue) * 100 : 0;

    // Daily breakdown
    const daily = await prisma.$queryRaw`
      SELECT
        DATE(s.created_at) AS date,
        COUNT(s.id) AS transactions,
        COALESCE(SUM(s.total_amount), 0) AS revenue,
        COALESCE(SUM(si.cost_price * si.quantity), 0) AS cogs,
        COALESCE(SUM(s.total_amount) - SUM(si.cost_price * si.quantity), 0) AS gross_profit
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.business_id = ${req.user.business_id}::uuid AND s.status = 'completed'
      GROUP BY DATE(s.created_at)
      ORDER BY date DESC
      LIMIT 90
    `;

    res.json({
      summary: {
        revenue,
        cogs,
        gross_profit: gross,
        gross_margin_pct: parseFloat(margin.toFixed(2)),
        transactions: totals._count.id,
        total_discounts: parseFloat(totals._sum.discountAmount || 0) + parseFloat(totals._sum.couponDiscount || 0) + parseFloat(totals._sum.loyaltyDiscount || 0),
        total_tips: parseFloat(totals._sum.tipAmount || 0),
      },
      daily,
    });
  } catch (err) { next(err); }
});


router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const now   = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in14Days   = new Date(now.getTime() + 14 * 86400000);

    const [
      todaySales, monthSales, stockValue, lowStockCount,
      expiringBatches, openTasks, activeProjects,
      todayByMethod, recentSales, topProducts, hourlyRows,
    ] = await Promise.all([
      // Today totals
      prisma.sale.aggregate({
        where: { businessId: bizId, status: 'completed', createdAt: { gte: todayStart } },
        _sum: { totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
        _count: { id: true },
      }),
      // Month revenue
      prisma.sale.aggregate({
        where: { businessId: bizId, status: 'completed', createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      // Stock value (cost)
      prisma.$queryRaw`
        SELECT COALESCE(SUM(sl.quantity * p.cost_price), 0) AS value, COUNT(DISTINCT p.id) AS product_count
        FROM stock_levels sl JOIN products p ON sl.product_id = p.id
        WHERE p.business_id = ${bizId}::uuid AND p.is_active = true
      `,
      // Low stock count
      prisma.$queryRaw`
        SELECT COUNT(*) AS count FROM (
          SELECT p.id FROM products p
          LEFT JOIN stock_levels sl ON sl.product_id = p.id
          WHERE p.business_id = ${bizId}::uuid AND p.is_active = true AND p.reorder_point > 0
          GROUP BY p.id, p.reorder_point
          HAVING COALESCE(SUM(sl.quantity), 0) <= p.reorder_point
        ) sub
      `,
      // Expiring batches in 14 days
      prisma.stockBatch.count({
        where: {
          product: { businessId: bizId, isActive: true },
          expiryDate: { lte: in14Days, gte: now },
          quantity: { gt: 0 },
        },
      }),
      // Open tasks
      prisma.task.count({ where: { businessId: bizId, status: { notIn: ['completed','cancelled'] } } }),
      // Active projects
      prisma.project.count({ where: { businessId: bizId, status: 'active' } }),
      // Today by payment method
      prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: { businessId: bizId, status: 'completed', createdAt: { gte: todayStart } },
        _sum: { totalAmount: true }, _count: { id: true },
      }),
      // Recent 5 sales
      prisma.sale.findMany({
        where: { businessId: bizId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, saleNumber: true, totalAmount: true, paymentMethod: true, createdAt: true, status: true, cashier: { select: { name: true } }, customer: { select: { name: true } } },
      }),
      // Top 5 products this month by revenue
      prisma.$queryRaw`
        SELECT p.name, p.id, SUM(si.quantity) AS units_sold, SUM(si.total_price) AS revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.business_id = ${bizId}::uuid AND s.status = 'completed'
          AND s.created_at >= ${monthStart}
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT 5
      `,
      // Today's revenue by hour (drives the 8:00–21:00 chart)
      prisma.$queryRaw`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COALESCE(SUM(total_amount), 0)::float AS revenue
        FROM sales
        WHERE business_id = ${bizId}::uuid AND status = 'completed' AND created_at >= ${todayStart}
        GROUP BY 1
      `,
    ]);

    // 14 buckets for hours 8..21 to match the dashboard chart
    const hourMap = {};
    hourlyRows.forEach(r => { hourMap[Number(r.hour)] = parseFloat(r.revenue || 0); });
    const hourly = Array.from({ length: 14 }, (_, i) => Math.round(hourMap[8 + i] || 0));

    const todayByMethodMap = {};
    todayByMethod.forEach(r => { todayByMethodMap[r.paymentMethod] = parseFloat(r._sum.totalAmount || 0); });

    res.json({
      sales_today:       parseFloat(todaySales._sum.totalAmount  || 0),
      transactions_today: todaySales._count.id,
      sales_month:       parseFloat(monthSales._sum.totalAmount  || 0),
      stock_value:       parseFloat(stockValue[0]?.value         || 0),
      total_products:    parseInt(stockValue[0]?.product_count   || 0),
      low_stock_count:   parseInt(lowStockCount[0]?.count        || 0),
      expiring_soon:     expiringBatches,
      open_tasks:        openTasks,
      active_projects:   activeProjects,
      cash_today:        todayByMethodMap['cash']       || 0,
      zaad_today:        todayByMethodMap['zaad']       || 0,
      card_today:        (todayByMethodMap['visa'] || 0) + (todayByMethodMap['mastercard'] || 0) + (todayByMethodMap['stripe'] || 0),
      by_method:         todayByMethod,
      recent_sales:      recentSales,
      top_products:      topProducts,
      hourly,
    });
  } catch (err) { next(err); }
});

// Revenue by product category for a period (defaults to the current month).
router.get('/sales-by-category', auth, async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const now = new Date();
    const fromDate = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(c.name, 'Uncategorized') AS name, COALESCE(SUM(si.total_price), 0)::float AS revenue
      FROM sale_items si
      JOIN sales s    ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.business_id = ${bizId}::uuid AND s.status = 'completed' AND s.created_at >= ${fromDate}
      GROUP BY 1
      ORDER BY revenue DESC
    `;
    res.json({ categories: rows.map(r => ({ name: r.name, revenue: parseFloat(r.revenue || 0) })) });
  } catch (err) { next(err); }
});

router.get('/low-stock', auth, async (req, res, next) => {
  try {
    const { location_id } = req.query;
    const products = await prisma.product.findMany({
      where: { businessId: req.user.business_id, isActive: true, reorderPoint: { gt: 0 } },
      include: {
        stockLevels: {
          where: location_id ? { locationId: location_id } : undefined,
          include: { location: { select: { name: true } } },
        },
        category: { select: { name: true } },
        supplierProducts: {
          where: { isPreferred: true },
          include: { supplier: { select: { id: true, name: true, whatsapp: true } } },
          take: 1,
        },
      },
    });

    const lowStock = products
      .map(p => {
        const stock = p.stockLevels.reduce((s, sl) => s + sl.quantity, 0);
        return { ...p, total_stock: stock };
      })
      .filter(p => p.total_stock <= p.reorderPoint)
      .sort((a, b) => (a.total_stock / Math.max(a.reorderPoint, 1)) - (b.total_stock / Math.max(b.reorderPoint, 1)))
      .map(p => ({
        id: p.id, name: p.name, sku: p.sku,
        category: p.category?.name,
        total_stock: p.total_stock,
        reorder_point: p.reorderPoint,
        deficit: p.reorderPoint - p.total_stock,
        preferred_supplier: p.supplierProducts[0]?.supplier || null,
        cost_price: p.costPrice,
        estimated_reorder_cost: Math.max(0, p.reorderPoint - p.total_stock) * parseFloat(p.costPrice),
        locations: p.stockLevels.map(sl => ({ name: sl.location.name, quantity: sl.quantity })),
      }));

    res.json({
      count: lowStock.length,
      estimated_total_reorder_cost: lowStock.reduce((s, p) => s + parseFloat(p.estimated_reorder_cost), 0),
      products: lowStock,
    });
  } catch (err) { next(err); }
});

// ── Commission report settings (calc method + agent source) ──
router.get('/commission/settings', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { commissionCalc: true, commissionAgentType: true } });
    res.json({ calculation_type: biz?.commissionCalc || 'invoice_value', agent_type: biz?.commissionAgentType || 'logged_in_user' });
  } catch (err) { next(err); }
});
router.put('/commission/settings', auth, requireRole('owner', 'manager'), validate(CommissionSettingsSchema), async (req, res, next) => {
  try {
    const { calculation_type, agent_type } = req.body;
    const biz = await prisma.business.update({
      where: { id: req.user.business_id },
      data: { ...(calculation_type && { commissionCalc: calculation_type }), ...(agent_type && { commissionAgentType: agent_type }) },
      select: { commissionCalc: true, commissionAgentType: true },
    });
    res.json({ calculation_type: biz.commissionCalc, agent_type: biz.commissionAgentType });
  } catch (err) { next(err); }
});

// Per-rep sales + commission. `calc` = invoice_value | payment_received.
router.get('/commission/reps', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const payCalc = req.query.calc === 'payment_received';
    const [users, agg, bands] = await Promise.all([
      prisma.user.findMany({ where: { businessId: req.user.business_id }, select: { id: true, name: true, role: true, commissionPercent: true } }),
      prisma.sale.groupBy({
        by: ['cashierId'],
        where: { businessId: req.user.business_id, status: 'completed' },
        _sum: { totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
        _count: { id: true },
      }),
      commission.loadBands(req.user.business_id),
    ]);
    const byUser = Object.fromEntries(agg.map(a => [a.cashierId, a]));
    const reps = users.map(u => {
      const a = byUser[u.id];
      const totalSale = parseFloat(a?._sum.totalAmount || 0);
      const totalReceived = parseFloat(a?._sum.cashAmount || 0) + parseFloat(a?._sum.zaadAmount || 0) + parseFloat(a?._sum.cardAmount || 0);
      const base = payCalc ? totalReceived : totalSale;
      // Tiered bands resolve against the same base the payout is priced on.
      const c = commission.commissionFor(bands.get(u.id), base, u.commissionPercent);
      return {
        user_id: u.id, name: u.name, role_name: u.role.charAt(0).toUpperCase() + u.role.slice(1),
        commission_percent: c.percent, total_sale: totalSale, total_received: totalReceived,
        tx_count: a?._count.id || 0, commission: c.commission,
      };
    }).sort((x, y) => y.commission - x.commission);
    res.json(reps);
  } catch (err) { next(err); }
});

router.get('/commission/reps/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { name: true, commissionPercent: true } });
    if (!user) return res.status(404).json({ title: 'Not found', status: 404 });
    const sales = await prisma.sale.findMany({
      where: { businessId: req.user.business_id, cashierId: req.params.id },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, saleNumber: true, status: true, totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
    });
    // Same resolution as the list, so the detail cannot show a different rate.
    const totalSale = sales.reduce((t, s) => t + parseFloat(s.totalAmount || 0), 0);
    const resolved = await commission.commissionForUser(req.user.business_id, req.params.id, totalSale, user.commissionPercent);
    res.json({
      name: user.name, commission_percent: resolved.percent,
      transactions: sales.map(s => ({
        id: s.saleNumber || s.id, status: s.status,
        total: parseFloat(s.totalAmount || 0),
        received: parseFloat(s.cashAmount || 0) + parseFloat(s.zaadAmount || 0) + parseFloat(s.cardAmount || 0),
      })),
    });
  } catch (err) { next(err); }
});

// Cash-register sessions (shifts) report.
router.get('/registers', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const shifts = await prisma.shift.findMany({
      where: { businessId: req.user.business_id },
      include: { cashier: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: { openedAt: 'desc' }, take: 100,
    });
    res.json(shifts.map(s => ({
      id: s.id,
      user_name: s.cashier?.name || '—',
      location_name: s.location?.name || '—',
      opened_at: s.openedAt ? s.openedAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      closed_at: s.closedAt ? s.closedAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      opening_cash: parseFloat(s.openingFloat || 0),
      total_sales: parseFloat(s.totalSales || 0),
      expected_cash: parseFloat(s.expectedCash != null ? s.expectedCash : (parseFloat(s.openingFloat || 0) + parseFloat(s.totalCash || 0))),
      refunds: 0,
      status: s.status,
      totals: { cash: parseFloat(s.totalCash || 0), zaad: parseFloat(s.totalZaad || 0), evc: 0, card: parseFloat(s.totalCard || 0), bank: 0 },
    })));
  } catch (err) { next(err); }
});

module.exports = router;
