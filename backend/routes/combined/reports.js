const express = require('express');
const bcrypt = require('bcryptjs');
const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { getBusinessSettings } = require('../../lib/businessSettings');
const accounting = require('../../lib/accounting');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
  ExpenseSchema, ExpenseCategorySchema,
  PaymentAccountSchema, AccountTransferSchema, AccountDepositSchema,
  CustomerGroupSchema, UnitSchema, BrandSchema, VariationTemplateSchema, DiscountSchema,
  PriceGroupSchema, InvoiceLayoutSchema, InvoiceSchemeSchema, CommissionSettingsSchema,
  ServiceTypeSchema,
} = require('../../validation/schemas');
const { trackLogin } = require('../../lib/metrics');

// ── REPORTS ──────────────────────────────────────────────────────────────────
const reportsRouter = express.Router();

reportsRouter.get('/sales', auth, async (req, res, next) => {
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

reportsRouter.get('/inventory', auth, async (req, res, next) => {
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

reportsRouter.get('/cashier', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { businessId: req.user.business_id, status: 'completed', ...(from && { createdAt: { gte: new Date(from) } }), ...(to && { createdAt: { lte: new Date(to) } }) };
    const report = await prisma.sale.groupBy({ by: ['cashierId'], where, _sum: { totalAmount: true }, _count: { id: true }, _avg: { totalAmount: true } });
    const cashiers = await prisma.user.findMany({ where: { id: { in: report.map(r => r.cashierId).filter(Boolean) } }, select: { id: true, name: true } });
    const cashierMap = Object.fromEntries(cashiers.map(c => [c.id, c.name]));
    res.json({ report: report.map(r => ({ cashier: cashierMap[r.cashierId] || 'Unknown', transactions: r._count.id, total: r._sum.totalAmount, avg: r._avg.totalAmount })) });
  } catch (err) { next(err); }
});

reportsRouter.get('/profit', auth, async (req, res, next) => {
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


reportsRouter.get('/dashboard', auth, async (req, res, next) => {
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
reportsRouter.get('/sales-by-category', auth, async (req, res, next) => {
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

reportsRouter.get('/low-stock', auth, async (req, res, next) => {
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
reportsRouter.get('/commission/settings', auth, async (req, res, next) => {
  try {
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id }, select: { commissionCalc: true, commissionAgentType: true } });
    res.json({ calculation_type: biz?.commissionCalc || 'invoice_value', agent_type: biz?.commissionAgentType || 'logged_in_user' });
  } catch (err) { next(err); }
});
reportsRouter.put('/commission/settings', auth, requireRole('owner', 'manager'), validate(CommissionSettingsSchema), async (req, res, next) => {
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
reportsRouter.get('/commission/reps', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const payCalc = req.query.calc === 'payment_received';
    const [users, agg] = await Promise.all([
      prisma.user.findMany({ where: { businessId: req.user.business_id }, select: { id: true, name: true, role: true, commissionPercent: true } }),
      prisma.sale.groupBy({
        by: ['cashierId'],
        where: { businessId: req.user.business_id, status: 'completed' },
        _sum: { totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
        _count: { id: true },
      }),
    ]);
    const byUser = Object.fromEntries(agg.map(a => [a.cashierId, a]));
    const reps = users.map(u => {
      const a = byUser[u.id];
      const totalSale = parseFloat(a?._sum.totalAmount || 0);
      const totalReceived = parseFloat(a?._sum.cashAmount || 0) + parseFloat(a?._sum.zaadAmount || 0) + parseFloat(a?._sum.cardAmount || 0);
      const pct = parseFloat(u.commissionPercent || 0);
      const base = payCalc ? totalReceived : totalSale;
      return {
        user_id: u.id, name: u.name, role_name: u.role.charAt(0).toUpperCase() + u.role.slice(1),
        commission_percent: pct, total_sale: totalSale, total_received: totalReceived,
        tx_count: a?._count.id || 0, commission: +(base * pct / 100).toFixed(2),
      };
    }).sort((x, y) => y.commission - x.commission);
    res.json(reps);
  } catch (err) { next(err); }
});

reportsRouter.get('/commission/reps/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, businessId: req.user.business_id }, select: { name: true, commissionPercent: true } });
    if (!user) return res.status(404).json({ title: 'Not found', status: 404 });
    const sales = await prisma.sale.findMany({
      where: { businessId: req.user.business_id, cashierId: req.params.id },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, saleNumber: true, status: true, totalAmount: true, cashAmount: true, zaadAmount: true, cardAmount: true },
    });
    res.json({
      name: user.name, commission_percent: parseFloat(user.commissionPercent || 0),
      transactions: sales.map(s => ({
        id: s.saleNumber || s.id, status: s.status,
        total: parseFloat(s.totalAmount || 0),
        received: parseFloat(s.cashAmount || 0) + parseFloat(s.zaadAmount || 0) + parseFloat(s.cardAmount || 0),
      })),
    });
  } catch (err) { next(err); }
});

// Cash-register sessions (shifts) report.
reportsRouter.get('/registers', auth, requireRole('owner', 'manager'), async (req, res, next) => {
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


// ── Profit / Loss report ─────────────────────────────────────────────────────
// Reference-parity statement: a Costs & Deductions column against a Revenue &
// Income column, periodic COGS (opening stock + net purchases − closing stock),
// gross/net profit with margins, and an informational tax summary.
//
// Stock values are reconstructed from cost layers:
//   value at date = current layer value − receipts after the date
//                   + consumption after the date
// where consumption is sales at their posted line cost, adjustment documents at
// their consumed FEFO cost, and purchase returns at landed cost. The sale-price
// figures use today's selling prices, so they are indicative. Transfers move
// stock_levels but not layers, so per-location stock values drift for
// businesses that transfer between branches (matches /stock/valuation).
//
// A sale that was later refunded keeps its full amounts in the sales rows; the
// refund appears as Sell Return (ex-tax, pro-rated like the GL reversal).

// Sales that posted stock + GL effects. Refunded sales stay in the totals —
// their reversal is the separate Sell Return line.
const PL_POSTED = ['completed', 'refunded', 'partially_refunded'];
const PL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plNum = (v) => parseFloat(v || 0) || 0;
const plRound = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A calendar-real YYYY-MM-DD string (typeof guards against ?from=a&from=b
// arriving as an array; the ISO round-trip rejects 2026-02-31 and friends).
function plParseDay(s) {
  if (typeof s !== 'string' || !PL_DATE_RE.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

// from/to are YYYY-MM-DD (or absent). Returns { fromDate, toEnd } where toEnd
// is EXCLUSIVE (start of the day after `to`), plus 400s on malformed input.
function plRange(req, res, startDate) {
  const { from, to } = req.query;
  const fromParsed = plParseDay(from), toParsed = plParseDay(to);
  if ((from != null && !fromParsed) || (to != null && !toParsed)) {
    res.status(400).json({ title: 'Dates must be real YYYY-MM-DD dates.', status: 400 });
    return null;
  }
  const loc = req.query.location_id || null;
  if (loc && !(typeof loc === 'string' && PL_UUID_RE.test(loc))) {
    res.status(400).json({ title: 'location_id must be a UUID.', status: 400 });
    return null;
  }
  const fromDate = fromParsed || new Date(startDate || '2000-01-01');
  const toEnd = toParsed ? new Date(toParsed.getTime() + 86400000) : new Date('2099-12-31');
  return { fromDate, toEnd, loc };
}

reportsRouter.get('/profit-loss', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const fromMonth = (req.query.from || '2000-01-01').slice(0, 7);
    const toMonth = (req.query.to || '2099-12-31').slice(0, 7);

    const [
      sales, refunds, expenses, purchases, purchaseReturns, transfers,
      adjDocs, adjLegacy, recovered, payroll, layers, saleOut, adjOut, prOut,
      reqOut, lineCogs,
    ] = await Promise.all([
      // Sales: subtotal is goods ex-tax after line discounts but BEFORE the
      // order-level discount/coupon/reward, which sit in the costs column.
      prisma.sale.aggregate({
        where: {
          businessId: bizId, status: { in: PL_POSTED },
          createdAt: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: {
          subtotal: true, discountAmount: true, couponDiscount: true,
          loyaltyDiscount: true, taxAmount: true, shippingCharges: true,
          expensesTotal: true, totalAmount: true,
          packingCharge: true, serviceCharge: true, tipAmount: true,
        },
        _count: { id: true },
      }),
      // Refunds are built from the sale items' ex-tax unit prices, so
      // total_refunded is already ex-tax — no tax share to strip here.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(r.total_refunded), 0)::float AS total
        FROM refunds r JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      `,
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(CASE WHEN is_refund THEN -amount ELSE amount END), 0)::float AS total,
          COALESCE(SUM(CASE WHEN is_refund THEN -tax_amount ELSE tax_amount END), 0)::float AS tax
        FROM expenses
        WHERE business_id = ${bizId}::uuid
          AND expense_date >= ${fromDate} AND expense_date < ${toEnd}
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
      `,
      // Purchases whose goods actually arrived. Subtotal is gross of the
      // supplier discount, which shows on the income side like the reference.
      prisma.purchaseOrder.aggregate({
        where: {
          businessId: bizId, status: { in: ['partial', 'received'] },
          orderDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { subtotal: true, discountAmount: true, taxAmount: true, freightCost: true, customsDuty: true, otherCharges: true },
      }),
      prisma.purchaseReturn.aggregate({
        where: {
          businessId: bizId,
          returnDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { subtotal: true, taxAmount: true },
      }),
      prisma.stockTransfer.aggregate({
        where: {
          businessId: bizId, status: { not: 'cancelled' },
          transferDate: { gte: fromDate, lt: toEnd },
          ...(loc && { OR: [{ fromLocationId: loc }, { toLocationId: loc }] }),
        },
        _sum: { shippingCharges: true },
      }),
      // Adjustment documents, valued at what the GL was actually charged.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(i.total_cost), 0)::float AS total
        FROM stock_adjustment_doc_items i
        JOIN stock_adjustment_docs d ON d.id = i.doc_id
        WHERE d.business_id = ${bizId}::uuid
          AND COALESCE(d.adjustment_date, d.created_at) >= ${fromDate}
          AND COALESCE(d.adjustment_date, d.created_at) < ${toEnd}
          AND (${loc}::uuid IS NULL OR d.location_id = ${loc}::uuid)
      `,
      // Legacy single-line adjustments: negative quantity = loss, positive
      // (found) = gain, valued like the approve flow (unit cost, else product cost).
      prisma.$queryRaw`
        SELECT COALESCE(SUM(
          (CASE WHEN a.quantity < 0 THEN 1 ELSE -1 END) *
          ABS(a.quantity) * (CASE WHEN a.unit_cost > 0 THEN a.unit_cost ELSE p.cost_price END)
        ), 0)::float AS total
        FROM stock_adjustments a JOIN products p ON p.id = a.product_id
        WHERE a.business_id = ${bizId}::uuid AND a.status = 'approved'
          AND COALESCE(a.approved_at, a.created_at) >= ${fromDate}
          AND COALESCE(a.approved_at, a.created_at) < ${toEnd}
          AND (${loc}::uuid IS NULL OR a.location_id = ${loc}::uuid)
      `,
      prisma.$queryRaw`
        SELECT COALESCE(SUM(total_recovered), 0)::float AS total
        FROM stock_adjustment_docs
        WHERE business_id = ${bizId}::uuid
          AND COALESCE(adjustment_date, created_at) >= ${fromDate}
          AND COALESCE(adjustment_date, created_at) < ${toEnd}
          AND (${loc}::uuid IS NULL OR location_id = ${loc}::uuid)
      `,
      // Payroll is keyed by month string; gross pay, like the 5100 posting.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(p.basic + p.allowance + p.overtime + p.bonus + p.incentive), 0)::float AS total
        FROM payrolls p JOIN employees e ON e.id = p.employee_id
        WHERE p.business_id = ${bizId}::uuid
          AND p.month >= ${fromMonth} AND p.month <= ${toMonth}
          AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
      `,
      // Stock reconstruction: current layers + receipts after each boundary,
      // with the PO-linked share broken out for the period reconciliation.
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(cl.quantity_remaining * cl.unit_cost) FILTER (WHERE cl.quantity_remaining > 0), 0)::float AS cur_cost,
          COALESCE(SUM(cl.quantity_remaining * p.selling_price) FILTER (WHERE cl.quantity_remaining > 0), 0)::float AS cur_sale,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.received_at >= ${fromDate}), 0)::float AS in_cost_from,
          COALESCE(SUM(cl.quantity_received * p.selling_price) FILTER (WHERE cl.received_at >= ${fromDate}), 0)::float AS in_sale_from,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.received_at >= ${toEnd}), 0)::float AS in_cost_to,
          COALESCE(SUM(cl.quantity_received * p.selling_price) FILTER (WHERE cl.received_at >= ${toEnd}), 0)::float AS in_sale_to,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.po_id IS NOT NULL AND cl.received_at >= ${fromDate} AND cl.received_at < ${toEnd}), 0)::float AS po_cost_period,
          COALESCE(SUM(cl.quantity_received * cl.unit_cost) FILTER (WHERE cl.po_id IS NULL AND cl.received_at >= ${fromDate} AND cl.received_at < ${toEnd}), 0)::float AS other_cost_period
        FROM cost_layers cl JOIN products p ON p.id = cl.product_id
        WHERE cl.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR cl.location_id = ${loc}::uuid)
      `,
      // ...consumption after each boundary: sales. cost_price > 0 is the mark
      // of a line that actually consumed layers (services carry 0; recipe lines
      // carry the ingredients' cost even though the finished good is unstocked).
      // Cancelled (voided) sales stay IN: their consumption pairs with the
      // restock layer the void created, keeping boundaries before the void true.
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(si.cost_price * si.quantity) FILTER (WHERE s.created_at >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(si.quantity * p.selling_price) FILTER (WHERE s.created_at >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(si.cost_price * si.quantity) FILTER (WHERE s.created_at >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(si.quantity * p.selling_price) FILTER (WHERE s.created_at >= ${toEnd}), 0)::float AS sale_to
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded', 'cancelled')
          AND si.cost_price > 0
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      `,
      // ...adjustment documents...
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(i.total_cost) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(i.total_cost) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE COALESCE(d.adjustment_date, d.created_at) >= ${toEnd}), 0)::float AS sale_to
        FROM stock_adjustment_doc_items i
        JOIN stock_adjustment_docs d ON d.id = i.doc_id
        JOIN products p ON p.id = i.product_id
        WHERE d.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR d.location_id = ${loc}::uuid)
      `,
      // ...and purchase returns (landed cost; qty is in purchase units, so the
      // sale-price side is approximate when purchase units differ).
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(i.total_price) FILTER (WHERE r.return_date >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE r.return_date >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(i.total_price) FILTER (WHERE r.return_date >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE r.return_date >= ${toEnd}), 0)::float AS sale_to
        FROM purchase_return_items i
        JOIN purchase_returns r ON r.id = i.purchase_return_id
        JOIN products p ON p.id = i.product_id
        WHERE r.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR r.location_id = ${loc}::uuid)
      `,
      // ...and construction material requisitions, which consume layers and
      // post project-materials COGS. Scoped through the owning project.
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(i.line_cost) FILTER (WHERE mr.created_at >= ${fromDate}), 0)::float AS cost_from,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE mr.created_at >= ${fromDate}), 0)::float AS sale_from,
          COALESCE(SUM(i.line_cost) FILTER (WHERE mr.created_at >= ${toEnd}), 0)::float AS cost_to,
          COALESCE(SUM(i.quantity * p.selling_price) FILTER (WHERE mr.created_at >= ${toEnd}), 0)::float AS sale_to
        FROM material_requisition_items i
        JOIN material_requisitions mr ON mr.id = i.requisition_id
        JOIN projects pr ON pr.id = mr.project_id
        JOIN products p ON p.id = i.product_id
        WHERE pr.business_id = ${bizId}::uuid
          AND (${loc}::uuid IS NULL OR i.location_id = ${loc}::uuid)
      `,
      // Transactional COGS for the period: FIFO line costs of sales made in the
      // period, minus the cost credited back by restocked returns refunded in
      // the period (mirrors the GL's Dr 5000 / Cr 5000 pair). Voided sales are
      // excluded together with their revenue — economically they never happened.
      prisma.$queryRaw`
        SELECT
          COALESCE((
            SELECT SUM(si.cost_price * si.quantity)
            FROM sale_items si JOIN sales s ON s.id = si.sale_id
            WHERE s.business_id = ${bizId}::uuid
              AND s.status IN ('completed', 'refunded', 'partially_refunded')
              AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
              AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          ), 0)::float AS sold,
          COALESCE((
            SELECT SUM(ri.quantity * si.cost_price)
            FROM refund_items ri
            JOIN refunds r ON r.id = ri.refund_id
            JOIN sale_items si ON si.id = ri.sale_item_id
            JOIN sales s ON s.id = r.sale_id
            WHERE r.business_id = ${bizId}::uuid AND ri.restock = true
              AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
              AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          ), 0)::float AS restocked
      `,
    ]);

    const L = layers[0] || {}, SO = saleOut[0] || {}, AO = adjOut[0] || {}, PO = prOut[0] || {}, RQ = reqOut[0] || {};
    const stockAt = (side, bound) => Math.max(0, plRound(
      plNum(L['cur_' + side]) - plNum(L[`in_${side}_${bound}`])
      + plNum(SO[`${side}_${bound}`]) + plNum(AO[`${side}_${bound}`])
      + plNum(PO[`${side}_${bound}`]) + plNum(RQ[`${side}_${bound}`])
    ));
    const openingCost = stockAt('cost', 'from'), openingSale = stockAt('sale', 'from');
    const closingCost = stockAt('cost', 'to'), closingSale = stockAt('sale', 'to');

    const ss = sales._sum;
    const ps = purchases._sum;
    const projectMaterials = plRound(plNum(RQ.cost_from) - plNum(RQ.cost_to));

    // Reference-parity display columns. The stock rows and the document-based
    // purchase rows are the reconciliation view; the summary below is computed
    // transactionally, so partial receipts, undocumented opening stock or
    // freight folded into landed layer costs cannot distort profit.
    const left = {
      opening_stock_purchase: openingCost,
      opening_stock_sale: openingSale,
      total_purchase: plRound(plNum(ps.subtotal)),
      stock_adjustment: plRound(plNum(adjDocs[0]?.total) + plNum(adjLegacy[0]?.total)),
      total_expense: plRound(plNum(expenses[0]?.total)),
      // Freight/customs/other are allocated into layer unit costs at receipt
      // (landed cost), so they reach profit through COGS — these two rows are
      // informational and excluded from other_expense to avoid double-counting.
      purchase_shipping: plRound(plNum(ps.freightCost)),
      purchase_additional_expenses: plRound(plNum(ps.customsDuty) + plNum(ps.otherCharges)),
      transfer_shipping: plRound(plNum(transfers._sum.shippingCharges)),
      sell_discount: plRound(plNum(ss.discountAmount) + plNum(ss.couponDiscount)),
      customer_reward: plRound(plNum(ss.loyaltyDiscount)),
      sell_return: plRound(plNum(refunds[0]?.total)),
      payroll: plRound(plNum(payroll[0]?.total)),
      project_materials: projectMaterials,
    };
    const right = {
      closing_stock_purchase: closingCost,
      closing_stock_sale: closingSale,
      total_sales: plRound(plNum(ss.subtotal)),
      sell_shipping: plRound(plNum(ss.shippingCharges)),
      sell_additional_expenses: plRound(plNum(ss.expensesTotal)),
      pos_charges: plRound(plNum(ss.packingCharge) + plNum(ss.serviceCharge) + plNum(ss.tipAmount)),
      stock_recovered: plRound(plNum(recovered[0]?.total)),
      purchase_return: plRound(plNum(purchaseReturns._sum.subtotal)),
      purchase_discount: plRound(plNum(ps.discountAmount)),
      round_off: 0, // rounding is not modelled on sales; kept for reference parity
    };

    // Transactional profit: COGS is the FIFO cost of the lines actually sold in
    // the period, net of the cost credited back by restocked returns. This is
    // the same basis as the "Profit by" breakdowns and the GL's account 5000.
    const netSales = plRound(right.total_sales - left.sell_discount - left.customer_reward - left.sell_return);
    const cogs = plRound(plNum(lineCogs[0]?.sold) - plNum(lineCogs[0]?.restocked));
    const grossProfit = plRound(netSales - cogs);
    // Order-level PO discounts never reach layer costs, so they are income here;
    // freight/customs are already inside COGS (landed) and are NOT re-expensed.
    const otherIncome = plRound(right.sell_shipping + right.sell_additional_expenses + right.pos_charges
      + right.stock_recovered + right.purchase_discount + right.round_off);
    const otherExpense = plRound(left.stock_adjustment + left.total_expense + left.transfer_shipping
      + left.payroll + left.project_materials);
    const netProfit = plRound(grossProfit + otherIncome - otherExpense);
    const pct = (n) => netSales > 0 ? plRound((n / netSales) * 100) : 0;

    const outputTax = plRound(plNum(ss.taxAmount));
    const inputTaxPurchases = plRound(plNum(ps.taxAmount) - plNum(purchaseReturns._sum.taxAmount));
    const inputTaxExpenses = plRound(plNum(expenses[0]?.tax));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      left,
      right,
      summary: {
        net_sales: netSales,
        cogs,
        gross_profit: grossProfit,
        gross_margin_pct: pct(grossProfit),
        other_income: otherIncome,
        other_expense: otherExpense,
        net_profit: netProfit,
        net_margin_pct: pct(netProfit),
        transactions: sales._count.id,
        // Reconciliation figures for the periodic identity: stock received in
        // the period at landed cost, split purchase-linked vs other inflows
        // (opening stock entries, restocked returns, void restores).
        purchases_received: plRound(plNum(L.po_cost_period)),
        stock_received_other: plRound(plNum(L.other_cost_period)),
      },
      tax: {
        output_tax: outputTax,
        input_tax_purchases: inputTaxPurchases,
        input_tax_expenses: inputTaxExpenses,
        net_tax: plRound(outputTax - inputTaxPurchases - inputTaxExpenses),
      },
    });
  } catch (err) { next(err); }
});

// ── Purchase & Sale report ───────────────────────────────────────────────────
// Reference parity: purchase totals (ex/inc tax), returns, supplier dues vs
// sale totals, sell returns and receivables for the range, plus the overall
// (sale − sell return) − (purchase − purchase return) and net due lines.
// Purchases count once goods arrived (partial/received), like the P&L; sales
// are posted documents; returns count in the period they were issued.
// Period basis: sales/refunds by created_at, purchases by order_date — the
// same uniform convention every report in this file uses. A back-dated
// invoice therefore lands in its entry period, consistently across reports.
reportsRouter.get('/purchase-sale', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    const [po, poDue, pret, sales, refunds] = await Promise.all([
      prisma.purchaseOrder.aggregate({
        where: {
          businessId: bizId, status: { in: ['partial', 'received'] },
          orderDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { totalAmount: true, taxAmount: true },
      }),
      // Per-PO due = what was actually received (landed layer value, the same
      // basis the supplier balance/AP is maintained on) minus returns minus
      // payments, clamped per order so an overpaid PO can't offset another's.
      // A half-received PO owes only its received half; a fully returned one
      // owes nothing.
      prisma.$queryRaw`
        SELECT COALESCE(SUM(GREATEST(
          COALESCE((SELECT SUM(cl.quantity_received * cl.unit_cost) FROM cost_layers cl WHERE cl.po_id = po.id), 0)
          - COALESCE((SELECT SUM(pr.total_amount) FROM purchase_returns pr WHERE pr.po_id = po.id), 0)
          - po.amount_paid, 0)), 0)::float AS due
        FROM purchase_orders po
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
      `,
      prisma.purchaseReturn.aggregate({
        where: {
          businessId: bizId,
          returnDate: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { totalAmount: true },
      }),
      prisma.sale.aggregate({
        where: {
          businessId: bizId, status: { in: PL_POSTED },
          createdAt: { gte: fromDate, lt: toEnd },
          ...(loc && { locationId: loc }),
        },
        _sum: { totalAmount: true, taxAmount: true, amountDue: true },
      }),
      prisma.$queryRaw`
        SELECT COALESCE(SUM(r.total_refunded), 0)::float AS total
        FROM refunds r JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      `,
    ]);

    const purchaseInc = plRound(plNum(po._sum.totalAmount));
    const purchaseEx = plRound(purchaseInc - plNum(po._sum.taxAmount));
    const purchaseReturns = plRound(plNum(pret._sum.totalAmount));
    const purchaseDue = plRound(plNum(poDue[0]?.due));
    const saleInc = plRound(plNum(sales._sum.totalAmount));
    const saleEx = plRound(saleInc - plNum(sales._sum.taxAmount));
    // Refunds are stored ex-tax (built from ex-tax unit prices).
    const sellReturns = plRound(plNum(refunds[0]?.total));
    const saleDue = plRound(plNum(sales._sum.amountDue));

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      purchases: {
        total_ex_tax: purchaseEx,
        total_inc_tax: purchaseInc,
        returns: purchaseReturns,   // stored ex-tax (created with taxAmount 0)
        due: purchaseDue,
      },
      sales: {
        total_ex_tax: saleEx,
        total_inc_tax: saleInc,
        returns: sellReturns,       // ex-tax, built from ex-tax unit prices
        due: saleDue,
      },
      overall: {
        // Netted on ONE tax basis (ex-tax) — both return figures are stored
        // ex-tax, so netting them against inc-tax totals would leave the
        // returned goods' tax share behind in the overall line.
        sale_minus_purchase: plRound((saleEx - sellReturns) - (purchaseEx - purchaseReturns)),
        due_amount: plRound(saleDue - purchaseDue),
      },
    });
  } catch (err) { next(err); }
});

// ── Tax report ───────────────────────────────────────────────────────────────
// Three registers — input tax (purchases), output tax (sales) and expense tax —
// each row carrying its per-tax-rate split, plus the overall
// output − input − expense position.
//
// Rate columns: every active tax rate gets one. A transaction taxed with a tax
// GROUP (e.g. GST@18% = CGST@10% + SGST@8%) is split across its component
// columns pro-rata by component rate, because that is what the group means for
// filing; the group's own column then stays empty for that row. Every row's
// columns therefore sum to its tax, with no double counting.
reportsRouter.get('/tax', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;
    const contact = req.query.contact_id || null;
    if (contact && !(typeof contact === 'string' && PL_UUID_RE.test(contact))) {
      return res.status(400).json({ title: 'contact_id must be a UUID.', status: 400 });
    }

    const [rates, subTaxes, purchases, sales, expenses, saleLineTax, sellReturns, purchaseReturns,
           purchaseAgg, salesAgg, expenseAgg] = await Promise.all([
      // ALL rates, not just active ones: tax booked against a rate that was
      // later deactivated still has to appear in its own column.
      prisma.taxRate.findMany({
        where: { businessId: bizId },
        select: { id: true, name: true, rate: true, isTaxGroup: true, forTaxGroupOnly: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.taxGroupSubTax.findMany({
        where: { taxGroup: { businessId: bizId } },
        select: { taxGroupId: true, taxRateId: true, taxRate: { select: { rate: true } } },
      }),
      // Purchases: the document's tax, attributed to the PO's own rate.
      prisma.$queryRaw`
        SELECT po.id, po.order_date AS date, po.po_number AS ref,
               po.total_amount AS total, po.tax_amount AS tax, po.discount_amount AS discount,
               po.tax_rate_id, po.payment_status,
               s.name AS contact_name, s.tax_number AS contact_tax_number
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND po.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR po.supplier_id = ${contact}::uuid)
        ORDER BY po.order_date DESC
        LIMIT 5000
      `,
      // Sales: one row per sale. Its tax splits across the rates its LINES
      // carry, with any order-level remainder (Add Sale's order tax) attributed
      // to the sale's own rate — see saleLineTax below.
      prisma.$queryRaw`
        SELECT s.id, s.created_at AS date,
               COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS ref,
               s.total_amount AS total, s.discount_amount AS discount,
               s.payment_method, s.tax_amount AS tax, s.tax_rate_id,
               c.name AS contact_name, c.tax_number AS contact_tax_number
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded')
          AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
          AND s.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
        ORDER BY s.created_at DESC
        LIMIT 5000
      `,
      // Expenses: refunds flip the sign so a refunded expense reverses its tax.
      prisma.$queryRaw`
        SELECT e.id, e.expense_date AS date, e.expense_number AS ref,
               (CASE WHEN e.is_refund THEN -e.amount ELSE e.amount END) AS total,
               (CASE WHEN e.is_refund THEN -e.tax_amount ELSE e.tax_amount END) AS tax,
               e.tax_rate_id, e.payment_status,
               c.name AS contact_name, c.tax_number AS contact_tax_number,
               (SELECT ep.method FROM expense_payments ep WHERE ep.expense_id = e.id ORDER BY ep.paid_on DESC LIMIT 1) AS payment_method
        FROM expenses e
        LEFT JOIN customers c ON c.id = e.contact_id
        WHERE e.business_id = ${bizId}::uuid
          AND e.expense_date >= ${fromDate} AND e.expense_date < ${toEnd}
          AND e.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR e.contact_id = ${contact}::uuid)
        ORDER BY e.expense_date DESC
        LIMIT 5000
      `,
      // Per-sale, per-rate line tax — scoped to exactly the sales above, so it
      // can neither grow unbounded nor drop lines for a sale that is shown.
      prisma.$queryRaw`
        WITH shown AS (
          SELECT s.id FROM sales s
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND s.tax_amount <> 0
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
          ORDER BY s.created_at DESC
          LIMIT 5000
        )
        SELECT si.sale_id, si.tax_rate_id, SUM(si.tax_amount)::numeric AS tax
        FROM sale_items si JOIN shown ON shown.id = si.sale_id
        WHERE si.tax_amount <> 0
        GROUP BY si.sale_id, si.tax_rate_id
      `,
      // Sell returns reverse output tax. Refunds carry no tax column, so each
      // returned line's tax is its share of the original line's tax, and its
      // rate is the line's rate — booked in the period the refund was issued.
      prisma.$queryRaw`
        SELECT r.id, r.created_at AS date,
               COALESCE(r.refund_number, LEFT(r.id::text, 8)) AS ref,
               r.refund_method AS payment_method,
               c.name AS contact_name, c.tax_number AS contact_tax_number,
               si.tax_rate_id,
               SUM(ri.quantity * (si.tax_amount / NULLIF(si.quantity, 0)))::numeric AS tax,
               SUM(ri.total_price)::numeric AS total
        FROM refund_items ri
        JOIN refunds r ON r.id = ri.refund_id
        JOIN sale_items si ON si.id = ri.sale_item_id
        JOIN sales s ON s.id = r.sale_id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND si.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
        GROUP BY r.id, r.created_at, r.refund_number, r.refund_method, c.name, c.tax_number, si.tax_rate_id
      `,
      // Purchase returns reverse input tax, at the rate of the PO they came from.
      prisma.$queryRaw`
        SELECT pr.id, pr.return_date AS date,
               COALESCE(pr.return_number, LEFT(pr.id::text, 8)) AS ref,
               pr.total_amount AS total, pr.tax_amount AS tax,
               po.tax_rate_id,
               s.name AS contact_name, s.tax_number AS contact_tax_number
        FROM purchase_returns pr
        LEFT JOIN purchase_orders po ON po.id = pr.po_id
        LEFT JOIN suppliers s ON s.id = pr.supplier_id
        WHERE pr.business_id = ${bizId}::uuid
          AND pr.return_date >= ${fromDate} AND pr.return_date < ${toEnd}
          AND pr.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR pr.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR pr.supplier_id = ${contact}::uuid)
      `,
      // Unbounded per-rate aggregates so the totals and the overall position
      // stay exact even when a register's rows hit the 5,000 display cap.
      prisma.$queryRaw`
        SELECT po.tax_rate_id, po.subtotal, po.discount_amount,
               SUM(po.tax_amount)::numeric AS tax, SUM(po.total_amount)::numeric AS total, COUNT(*)::int AS n
        FROM purchase_orders po
        WHERE po.business_id = ${bizId}::uuid
          AND po.status IN ('partial', 'received')
          AND po.order_date >= ${fromDate} AND po.order_date < ${toEnd}
          AND po.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR po.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR po.supplier_id = ${contact}::uuid)
        GROUP BY po.tax_rate_id, po.subtotal, po.discount_amount
      `,
      // Sales: line taxes by their own rate, UNION the per-sale order-level
      // remainder (plus the sale totals/counts) by the sale's rate, so the two
      // branches together sum to exactly SUM(sales.tax_amount).
      prisma.$queryRaw`
        SELECT tax_rate_id, SUM(tax)::numeric AS tax, SUM(total)::numeric AS total, SUM(n)::int AS n
        FROM (
          SELECT si.tax_rate_id,
                 SUM(si.tax_amount) AS tax, 0::numeric AS total, 0 AS n
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND s.tax_amount <> 0
            AND si.tax_amount <> 0
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
          GROUP BY si.tax_rate_id
          UNION ALL
          SELECT COALESCE(s.tax_rate_id, ${bset.default_sale_tax || null}::uuid),
                 SUM(s.tax_amount - COALESCE(li.line_tax, 0)) AS tax,
                 SUM(s.total_amount) AS total,
                 COUNT(*) AS n
          FROM sales s
          LEFT JOIN LATERAL (
            SELECT SUM(si.tax_amount) AS line_tax FROM sale_items si WHERE si.sale_id = s.id
          ) li ON TRUE
          WHERE s.business_id = ${bizId}::uuid
            AND s.status IN ('completed', 'refunded', 'partially_refunded')
            AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
            AND s.tax_amount <> 0
            AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
            AND (${contact}::uuid IS NULL OR s.customer_id = ${contact}::uuid)
          -- Positional: repeating the COALESCE would bind a SECOND parameter,
          -- which Postgres will not match against the select-list expression.
          GROUP BY 1
        ) u
        GROUP BY tax_rate_id
      `,
      prisma.$queryRaw`
        SELECT e.tax_rate_id,
               SUM(CASE WHEN e.is_refund THEN -e.tax_amount ELSE e.tax_amount END)::numeric AS tax,
               SUM(CASE WHEN e.is_refund THEN -e.amount ELSE e.amount END)::numeric AS total,
               COUNT(*)::int AS n
        FROM expenses e
        WHERE e.business_id = ${bizId}::uuid
          AND e.expense_date >= ${fromDate} AND e.expense_date < ${toEnd}
          AND e.tax_amount <> 0
          AND (${loc}::uuid IS NULL OR e.location_id = ${loc}::uuid)
          AND (${contact}::uuid IS NULL OR e.contact_id = ${contact}::uuid)
        GROUP BY e.tax_rate_id
      `,
    ]);

    // Group id → [{ rateId, weight }] normalised so the weights sum to 1.
    const groupSplit = new Map();
    for (const st of subTaxes) {
      if (!groupSplit.has(st.taxGroupId)) groupSplit.set(st.taxGroupId, []);
      groupSplit.get(st.taxGroupId).push({ rateId: st.taxRateId, rate: plNum(st.taxRate?.rate) });
    }
    for (const [, parts] of groupSplit) {
      const sum = parts.reduce((s, p) => s + p.rate, 0);
      parts.forEach(p => { p.weight = sum > 0 ? p.rate / sum : 1 / parts.length; });
    }

    // Spread one row's tax across the rate columns it belongs to.
    const splitTax = (rateId, amount) => {
      const out = {};
      const amt = plRound(amount);
      if (!amt) return out;
      const parts = rateId ? groupSplit.get(rateId) : null;
      if (parts && parts.length) {
        // Give the remainder to the largest component so the parts sum exactly.
        let left = amt, biggest = 0;
        parts.forEach((p, i) => {
          const share = plRound(amt * p.weight);
          out[p.rateId] = share;
          left = plRound(left - share);
          if (p.weight > parts[biggest].weight) biggest = i;
        });
        if (left) out[parts[biggest].rateId] = plRound(out[parts[biggest].rateId] + left);
      } else {
        out[rateId || 'untaxed'] = amt;
      }
      return out;
    };

    const mergeInto = (target, add) => {
      for (const [k, v] of Object.entries(add)) target[k] = plRound((target[k] || 0) + v);
      return target;
    };

    // byRate defaults to the whole tax under the row's own rate; sales override
    // it with their per-line split.
    const shape = (rows, byRateOf) => rows.map(r => {
      const tax = plRound(plNum(r.tax));
      return {
        id: r.id,
        date: r.date,
        ref: r.ref || String(r.id).slice(0, 8),
        contact: r.contact_name || null,
        tax_number: r.contact_tax_number || null,
        total: plRound(plNum(r.total)),
        discount: plRound(plNum(r.discount)),
        payment_method: r.payment_method || r.payment_status || null,
        tax,
        by_rate: byRateOf ? byRateOf(r, tax) : splitTax(r.tax_rate_id, tax),
      };
    });

    const lineTaxBySale = new Map();
    for (const l of saleLineTax) {
      if (!lineTaxBySale.has(l.sale_id)) lineTaxBySale.set(l.sale_id, []);
      lineTaxBySale.get(l.sale_id).push({ rateId: l.tax_rate_id, tax: plRound(plNum(l.tax)) });
    }

    // A POS sale without its own rate still carries order tax at the till's
    // configured default rate.
    const defaultSaleRate = bset.default_sale_tax || null;

    const input = [
      ...shape(purchases),
      // Purchase returns reverse input tax, at the originating PO's rate.
      ...shape(purchaseReturns).map(r => ({
        ...r, kind: 'return',
        total: plRound(-r.total), tax: plRound(-r.tax),
        by_rate: splitTax(r.tax_rate_id, plRound(-r.tax)),
      })),
    ].filter(r => r.tax !== 0);

    const output = [
      ...shape(sales, (r, tax) => {
        const lines = lineTaxBySale.get(r.id) || [];
        const acc = {};
        let covered = 0;
        for (const l of lines) {
          mergeInto(acc, splitTax(l.rateId, l.tax));
          covered = plRound(covered + l.tax);
        }
        // Whatever the lines don't account for is the order-level tax, which
        // belongs to the sale's own rate (or the till default).
        const remainder = plRound(tax - covered);
        if (remainder) mergeInto(acc, splitTax(r.tax_rate_id || defaultSaleRate, remainder));
        return acc;
      }),
      // Sell returns reverse output tax in the period they were issued, so the
      // filed liability matches the ledger's tax reversal.
      ...(() => {
        const byRefund = new Map();
        for (const r of sellReturns) {
          const cur = byRefund.get(r.id) || {
            id: r.id, date: r.date, ref: r.ref, kind: 'return',
            contact: r.contact_name || null, tax_number: r.contact_tax_number || null,
            payment_method: r.payment_method || null,
            total: 0, tax: 0, by_rate: {}, discount: 0,
          };
          const tax = plRound(-plNum(r.tax));
          cur.total = plRound(cur.total - plNum(r.total));
          cur.tax = plRound(cur.tax + tax);
          mergeInto(cur.by_rate, splitTax(r.tax_rate_id, tax));
          byRefund.set(r.id, cur);
        }
        return [...byRefund.values()];
      })(),
    ].filter(r => r.tax !== 0);

    const expense = shape(expenses).filter(r => r.tax !== 0);

    // Totals come from the UNBOUNDED aggregates so they stay exact when a
    // register's rows hit the display cap; the reversal rows (which are never
    // capped) are folded in on top. Payment-method counts describe the rows
    // actually returned.
    const totalsOf = (agg, extraRows, rows) => {
      const byRate = {};
      let total = 0, tax = 0, count = 0;
      for (const a of agg) {
        const t = plRound(plNum(a.tax));
        total = plRound(total + plNum(a.total));
        tax = plRound(tax + t);
        count += Number(a.n) || 0;
        mergeInto(byRate, splitTax(a.tax_rate_id, t));
      }
      for (const r of extraRows) {
        total = plRound(total + r.total);
        tax = plRound(tax + r.tax);
        count += 1;
        mergeInto(byRate, r.by_rate);
      }
      const methods = {};
      for (const r of rows) if (r.payment_method) methods[r.payment_method] = (methods[r.payment_method] || 0) + 1;
      return { total, tax, by_rate: byRate, by_method: methods, count };
    };

    const isReturn = (r) => r.kind === 'return';
    const inputT = totalsOf(purchaseAgg, input.filter(isReturn), input);
    const outputT = totalsOf(salesAgg, output.filter(isReturn), output);
    const expenseT = totalsOf(expenseAgg, [], expense);

    res.json({
      period: { from: req.query.from || null, to: req.query.to || null },
      location_id: loc,
      contact_id: contact,
      // Components first so grouped rates read left-to-right like the reference.
      rates: rates.map(r => ({
        id: r.id, name: r.name,
        rate_pct: plRound(plNum(r.rate) * 100),
        is_group: r.isTaxGroup, component: r.forTaxGroupOnly, is_active: r.isActive,
      })),
      input, output, expense,
      totals: { input: inputT, output: outputT, expense: expenseT },
      overall: { net_tax: plRound(outputT.tax - inputT.tax - expenseT.tax) },
      limited: {
        input: purchases.length === 5000,
        output: sales.length === 5000,
        expense: expenses.length === 5000,
      },
    });
  } catch (err) { next(err); }
});

// ── Profit by product / category / brand / … ─────────────────────────────────
// Line profit = (line net − refunded share) − cost × (qty − restocked qty).
// Same period basis as the statement: a refund counts in the period it was
// issued. Refunds of sales from BEFORE the range enter through a second union
// branch (their sale row is outside the range); for the date/day/invoice
// groups that branch is labeled by the refund's date (s.created_at fragments
// are rewritten to r.created_at). gkey keeps distinct entities with the same
// display name apart; ord feeds the non-profit sort orders.
const PL_GROUPS = {
  product: {
    select: `p.name AS label, p.sku AS sub`, gkey: `p.id::text`,
    join: ``, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  category: {
    select: `COALESCE(c.name, 'Uncategorized') AS label, NULL::text AS sub`, gkey: `COALESCE(c.id::text, '')`,
    join: `LEFT JOIN categories c ON c.id = p.category_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  brand: {
    select: `COALESCE(b.name, 'No brand') AS label, NULL::text AS sub`, gkey: `COALESCE(b.id::text, '')`,
    join: `LEFT JOIN brands b ON b.id = p.brand_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  location: {
    select: `COALESCE(l.name, 'No location') AS label, NULL::text AS sub`, gkey: `COALESCE(l.id::text, '')`,
    join: `LEFT JOIN locations l ON l.id = s.location_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  invoice: {
    select: `COALESCE(s.sale_number, LEFT(s.id::text, 8)) AS label,
             TO_CHAR(s.created_at, 'YYYY-MM-DD') || COALESCE(' · ' || cu.name, '') AS sub`,
    gkey: `s.id::text`,
    join: `LEFT JOIN customers cu ON cu.id = s.customer_id`,
    ord: `s.created_at`, outerOrder: `MAX(ord) DESC`,
  },
  date: {
    select: `TO_CHAR(DATE(s.created_at), 'YYYY-MM-DD') AS label, NULL::text AS sub`, gkey: `''`,
    join: ``, ord: `NULL::timestamp`, outerOrder: `label DESC`,
  },
  customer: {
    select: `COALESCE(cu.name, 'Walk-in Customer') AS label, NULL::text AS sub`, gkey: `COALESCE(cu.id::text, '')`,
    join: `LEFT JOIN customers cu ON cu.id = s.customer_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
  day: {
    select: `TO_CHAR(s.created_at, 'FMDay') AS label, NULL::text AS sub`, gkey: `''`,
    join: ``, ord: `s.created_at`, outerOrder: `MIN(EXTRACT(DOW FROM ord))`,
  },
  staff: {
    select: `COALESCE(u.name, '—') AS label, NULL::text AS sub`, gkey: `COALESCE(u.id::text, '')`,
    join: `LEFT JOIN users u ON u.id = s.cashier_id`, ord: `NULL::timestamp`, outerOrder: `profit DESC`,
  },
};

reportsRouter.get('/profit-loss/by', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    // hasOwnProperty guard: ?group=constructor must not reach the prototype.
    const g = Object.prototype.hasOwnProperty.call(PL_GROUPS, String(req.query.group))
      ? PL_GROUPS[req.query.group] : null;
    if (!g) return res.status(400).json({ title: `group must be one of: ${Object.keys(PL_GROUPS).join(', ')}.`, status: 400 });
    const bizId = req.user.business_id;
    const bset = await getBusinessSettings(bizId);
    const range = plRange(req, res, bset.start_date);
    if (!range) return;
    const { fromDate, toEnd, loc } = range;

    // Same period basis as the statement: refunds count when they happen, and
    // only restocked returns credit cost back (unrestocked goods stay in COGS).
    // Branch 1: sales made in the period, net of in-period refunds on them.
    // Branch 2: in-period refunds whose sale predates the period — labeled by
    // the refund's date for the time-keyed groups.
    // Group fragments are static strings from the whitelist above — never user
    // input — so Prisma.raw is safe here; all values stay bound parameters.
    const selRefund = g.select.split('s.created_at').join('r.created_at');
    const ordRefund = g.ord.split('s.created_at').join('r.created_at');
    const u = Prisma.sql`
      rf AS (
        SELECT ri.sale_item_id,
               SUM(ri.quantity)::int AS qty,
               SUM(ri.quantity) FILTER (WHERE ri.restock) AS qty_restocked,
               SUM(ri.total_price) AS amount
        FROM refund_items ri JOIN refunds r ON r.id = ri.refund_id
        WHERE r.business_id = ${bizId}::uuid AND ri.sale_item_id IS NOT NULL
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
        GROUP BY ri.sale_item_id
      ),
      u AS (
        SELECT ${Prisma.raw(g.gkey)} AS gkey, ${Prisma.raw(g.select)}, ${Prisma.raw(g.ord)} AS ord,
               (si.quantity - COALESCE(rf.qty, 0))::float AS qty,
               (si.total_price - COALESCE(rf.amount, 0))::float AS sales,
               ((si.total_price - COALESCE(rf.amount, 0)) - si.cost_price * (si.quantity - COALESCE(rf.qty_restocked, 0)))::float AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        LEFT JOIN rf ON rf.sale_item_id = si.id
        ${Prisma.raw(g.join)}
        WHERE s.business_id = ${bizId}::uuid
          AND s.status IN ('completed', 'refunded', 'partially_refunded')
          AND s.created_at >= ${fromDate} AND s.created_at < ${toEnd}
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
        UNION ALL
        SELECT ${Prisma.raw(g.gkey)} AS gkey, ${Prisma.raw(selRefund)}, ${Prisma.raw(ordRefund)} AS ord,
               (-ri.quantity)::float AS qty,
               (-ri.total_price)::float AS sales,
               (-(ri.total_price - si.cost_price * (CASE WHEN ri.restock THEN ri.quantity ELSE 0 END)))::float AS profit
        FROM refund_items ri
        JOIN refunds r ON r.id = ri.refund_id
        JOIN sale_items si ON si.id = ri.sale_item_id
        JOIN sales s ON s.id = r.sale_id
        JOIN products p ON p.id = si.product_id
        ${Prisma.raw(g.join)}
        WHERE r.business_id = ${bizId}::uuid
          AND r.created_at >= ${fromDate} AND r.created_at < ${toEnd}
          AND NOT (s.created_at >= ${fromDate} AND s.created_at < ${toEnd})
          AND (${loc}::uuid IS NULL OR s.location_id = ${loc}::uuid)
      )`;

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`
        WITH ${u}
        SELECT label, sub,
          COALESCE(SUM(qty), 0)::float AS qty,
          COALESCE(SUM(sales), 0)::float AS sales,
          COALESCE(SUM(profit), 0)::float AS profit
        FROM u
        GROUP BY gkey, label, sub
        ORDER BY ${Prisma.raw(g.outerOrder)}
        LIMIT 1000
      `),
      // Grand totals over the WHOLE filtered set — not just the shown rows.
      prisma.$queryRaw(Prisma.sql`
        WITH ${u}
        SELECT COALESCE(SUM(qty), 0)::float AS qty,
               COALESCE(SUM(sales), 0)::float AS sales,
               COALESCE(SUM(profit), 0)::float AS profit
        FROM u
      `),
    ]);

    const out = rows.map(r => ({
      label: r.label || '—', sub: r.sub || null,
      qty: plNum(r.qty), sales: plRound(plNum(r.sales)), profit: plRound(plNum(r.profit)),
    }));
    const t = totalRows[0] || {};
    res.json({
      group: req.query.group,
      rows: out,
      totals: { qty: plNum(t.qty), sales: plRound(plNum(t.sales)), profit: plRound(plNum(t.profit)) },
      limited: rows.length === 1000,
    });
  } catch (err) { next(err); }
});

module.exports = { reportsRouter };
