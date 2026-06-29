/**
 * AI Merchant Insights Engine
 *
 * Gathers real business data from the database, compresses it into
 * a structured context, and sends it to Claude for analysis.
 *
 * Design principles:
 *   1. Data first — never ask Claude to guess. Every insight is grounded
 *      in actual numbers from the merchant's database.
 *   2. Concise context — we summarise the data before sending it.
 *      Sending raw rows would be slow and expensive.
 *   3. Merchant language — responses in plain language, no jargon.
 *      A grocery owner in Hargeisa should understand every sentence.
 *   4. Actionable — every insight ends with something the merchant can do.
 *   5. Multilingual — Claude responds in the language of the question.
 *
 * Usage:
 *   const { gatherContext, askInsight } = require('./insights');
 *   const context = await gatherContext(businessId, { days: 30 });
 *   const answer  = await askInsight(context, 'Why did my sales drop?');
 */

const prisma = require('./prisma');
const { logger } = require('./logger');

// ── Data Gathering ────────────────────────────────────────────────

/**
 * Gather a comprehensive business context snapshot.
 * This is the data that gets sent to Claude for every insight request.
 * Structured to be informative but compact — typically 2-4KB.
 *
 * @param {string} businessId
 * @param {object} opts
 * @param {number} opts.days   — lookback period (default 30)
 * @returns {Promise<object>}  — structured context object
 */
async function gatherContext(businessId, { days = 30 } = {}) {
  const now        = new Date();
  const fromDate   = new Date(now.getTime() - days * 86400000);
  const prevFrom   = new Date(fromDate.getTime() - days * 86400000); // previous period for comparison
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const weekStart  = new Date(now); weekStart.setDate(weekStart.getDate() - 7);

  // Run all queries in parallel for speed
  const [
    business,
    salesTotals, prevSalesTotals,
    salesByDay, salesByHour, salesByDow,
    topProducts, slowProducts,
    stockLevels, lowStock, recentAdjustments,
    customerStats, topCustomers,
    staffStats,
    supplierStats,
    hotelStats,
    restaurantStats,
    recentRefunds,
    taxSummary,
  ] = await Promise.all([

    // Business info
    prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, currency: true, country: true, city: true, receiptFooter: true },
    }),

    // Current period sales
    prisma.sale.aggregate({
      where: { businessId, status: 'completed', createdAt: { gte: fromDate } },
      _sum:  { totalAmount: true, discountAmount: true, taxAmount: true, tipAmount: true },
      _count: { id: true },
      _avg:  { totalAmount: true },
    }),

    // Previous period sales (for comparison)
    prisma.sale.aggregate({
      where: { businessId, status: 'completed', createdAt: { gte: prevFrom, lt: fromDate } },
      _sum:  { totalAmount: true },
      _count: { id: true },
    }),

    // Daily revenue for trend analysis
    prisma.$queryRaw`
      SELECT DATE(created_at) AS date,
             COUNT(id)::int AS txns,
             ROUND(SUM(total_amount)::numeric, 2) AS revenue
      FROM sales
      WHERE business_id = ${businessId}::uuid
        AND status = 'completed'
        AND created_at >= ${fromDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT ${days}
    `,

    // Sales by hour of day (peak hours)
    prisma.$queryRaw`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
             COUNT(id)::int AS txns,
             ROUND(AVG(total_amount)::numeric, 2) AS avg_amount
      FROM sales
      WHERE business_id = ${businessId}::uuid
        AND status = 'completed'
        AND created_at >= ${fromDate}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY txns DESC
      LIMIT 5
    `,

    // Sales by day of week
    prisma.$queryRaw`
      SELECT TO_CHAR(created_at, 'Day') AS day_name,
             EXTRACT(DOW FROM created_at)::int AS dow,
             COUNT(id)::int AS txns,
             ROUND(SUM(total_amount)::numeric, 2) AS revenue
      FROM sales
      WHERE business_id = ${businessId}::uuid
        AND status = 'completed'
        AND created_at >= ${fromDate}
      GROUP BY TO_CHAR(created_at, 'Day'), EXTRACT(DOW FROM created_at)
      ORDER BY revenue DESC
    `,

    // Top 10 products by revenue
    prisma.$queryRaw`
      SELECT p.name, p.selling_price, p.cost_price,
             SUM(si.quantity)::int AS units_sold,
             ROUND(SUM(si.total_price)::numeric, 2) AS revenue,
             ROUND((p.selling_price - p.cost_price) / NULLIF(p.selling_price, 0) * 100, 1) AS margin_pct
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
      GROUP BY p.id, p.name, p.selling_price, p.cost_price
      ORDER BY revenue DESC
      LIMIT 10
    `,

    // Slow-moving / deadstock products (in stock but no sales)
    prisma.$queryRaw`
      SELECT p.name, COALESCE(SUM(sl.quantity), 0)::int AS stock,
             ROUND((p.cost_price * COALESCE(SUM(sl.quantity), 0))::numeric, 2) AS tied_capital
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      LEFT JOIN sale_items si ON si.product_id = p.id
        AND si.sale_id IN (
          SELECT id FROM sales WHERE business_id = ${businessId}::uuid
            AND status = 'completed' AND created_at >= ${fromDate}
        )
      WHERE p.business_id = ${businessId}::uuid AND p.is_active = true
      GROUP BY p.id, p.name, p.cost_price
      HAVING SUM(si.quantity) IS NULL AND COALESCE(SUM(sl.quantity), 0) > 0
      ORDER BY tied_capital DESC
      LIMIT 5
    `,

    // Stock summary
    prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT p.id)::int AS total_products,
        ROUND(SUM(sl.quantity * p.cost_price)::numeric, 2) AS stock_value,
        COUNT(DISTINCT CASE WHEN sl.quantity <= p.reorder_point AND p.reorder_point > 0 THEN p.id END)::int AS low_stock_count,
        COUNT(DISTINCT CASE WHEN sl.quantity = 0 THEN p.id END)::int AS out_of_stock_count
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.business_id = ${businessId}::uuid AND p.is_active = true
    `,

    // Low stock products
    prisma.$queryRaw`
      SELECT p.name, COALESCE(SUM(sl.quantity), 0)::int AS current_stock, p.reorder_point
      FROM products p
      LEFT JOIN stock_levels sl ON sl.product_id = p.id
      WHERE p.business_id = ${businessId}::uuid
        AND p.is_active = true AND p.reorder_point > 0
      GROUP BY p.id, p.name, p.reorder_point
      HAVING COALESCE(SUM(sl.quantity), 0) <= p.reorder_point
      ORDER BY current_stock ASC
      LIMIT 8
    `,

    // Recent stock adjustments (shrinkage/waste signal)
    prisma.stockAdjustment.aggregate({
      where: { businessId, createdAt: { gte: fromDate } },
      _count: { id: true },
      _sum:   { quantity: true },
    }),

    // Customer stats
    prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT s.customer_id)::int AS unique_customers,
        COUNT(DISTINCT CASE WHEN s.customer_id IS NOT NULL THEN s.id END)::int AS sales_with_customer,
        COUNT(s.id)::int AS total_sales,
        ROUND(AVG(CASE WHEN s.customer_id IS NOT NULL THEN s.total_amount END)::numeric, 2) AS avg_with_customer,
        ROUND(AVG(CASE WHEN s.customer_id IS NULL THEN s.total_amount END)::numeric, 2) AS avg_walk_in
      FROM sales s
      WHERE s.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
    `,

    // Top customers by spend
    prisma.$queryRaw`
      SELECT c.name, COUNT(s.id)::int AS visits,
             ROUND(SUM(s.total_amount)::numeric, 2) AS total_spent,
             ROUND(AVG(s.total_amount)::numeric, 2) AS avg_spend,
             c.loyalty_points, c.outstanding_balance
      FROM customers c
      JOIN sales s ON s.customer_id = c.id
      WHERE s.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
      GROUP BY c.id, c.name, c.loyalty_points, c.outstanding_balance
      ORDER BY total_spent DESC
      LIMIT 5
    `,

    // Staff performance
    prisma.$queryRaw`
      SELECT u.name,
             COUNT(s.id)::int AS sales_count,
             ROUND(SUM(s.total_amount)::numeric, 2) AS total_revenue,
             ROUND(AVG(s.total_amount)::numeric, 2) AS avg_ticket,
             COUNT(r.id)::int AS refund_count
      FROM users u
      JOIN sales s ON s.cashier_id = u.id
      LEFT JOIN refunds r ON r.sale_id = s.id
      WHERE u.business_id = ${businessId}::uuid
        AND s.status = 'completed'
        AND s.created_at >= ${fromDate}
      GROUP BY u.id, u.name
      ORDER BY total_revenue DESC
      LIMIT 5
    `,

    // Supplier stats — lead times and reliability
    prisma.$queryRaw`
      SELECT sup.name,
             COUNT(po.id)::int AS orders,
             ROUND(AVG(EXTRACT(DAY FROM (grn.received_date - po.created_at)))::numeric, 1) AS avg_lead_days,
             ROUND(SUM(po.total_amount)::numeric, 2) AS total_ordered
      FROM suppliers sup
      JOIN purchase_orders po ON po.supplier_id = sup.id
      LEFT JOIN goods_received_notes grn ON grn.po_id = po.id
      WHERE sup.business_id = ${businessId}::uuid
        AND po.created_at >= ${fromDate}
      GROUP BY sup.id, sup.name
      ORDER BY total_ordered DESC
      LIMIT 5
    `,

    // Hotel stats (if applicable)
    prisma.reservation.aggregate({
      where: { businessId, createdAt: { gte: fromDate } },
      _count: { id: true },
      _sum:   { totalRoomCharge: true, depositPaid: true },
      _avg:   { nights: true },
    }).catch(() => null),

    // Restaurant stats (if applicable)
    prisma.restaurantOrder.aggregate({
      where: { businessId, status: 'completed', completedAt: { gte: fromDate } },
      _count: { id: true },
      _sum:   { totalAmount: true },
      _avg:   { totalAmount: true, covers: true },
    }).catch(() => null),

    // Refund rate
    prisma.refund.aggregate({
      where: {
        sale: { businessId },
        createdAt: { gte: fromDate },
      },
      _count: { id: true },
      _sum:   { totalRefunded: true },
    }),

    // Tax collected
    prisma.sale.aggregate({
      where: { businessId, status: 'completed', createdAt: { gte: fromDate } },
      _sum: { taxAmount: true },
    }),
  ]);

  // ── Compute derived metrics ───────────────────────────────────

  const revenue      = parseFloat(salesTotals._sum.totalAmount || 0);
  const prevRevenue  = parseFloat(prevSalesTotals._sum.totalAmount || 0);
  const revenueChange = prevRevenue > 0
    ? parseFloat(((revenue - prevRevenue) / prevRevenue * 100).toFixed(1))
    : null;

  const txns     = salesTotals._count.id || 0;
  const prevTxns = prevSalesTotals._count.id || 0;
  const avgTicket = parseFloat(salesTotals._avg.totalAmount || 0);

  const refundRate = txns > 0
    ? parseFloat(((recentRefunds._count.id || 0) / txns * 100).toFixed(1))
    : 0;

  // Best and worst days
  const sortedDays = [...salesByDow].sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue));
  const bestDay    = sortedDays[0];
  const worstDay   = sortedDays[sortedDays.length - 1];

  // Peak hours
  const peakHours = salesByHour.slice(0, 3).map(h => ({
    hour: `${h.hour}:00`,
    txns: h.txns,
  }));

  return {
    meta: {
      businessId,
      businessName: business?.name,
      currency:     business?.currency || 'USD',
      country:      business?.country  || 'Unknown',
      city:         business?.city     || '',
      periodDays:   days,
      from:         fromDate.toISOString().split('T')[0],
      to:           now.toISOString().split('T')[0],
      generatedAt:  now.toISOString(),
    },
    revenue: {
      total:        revenue,
      previous:     prevRevenue,
      change_pct:   revenueChange,
      transactions: txns,
      prev_transactions: prevTxns,
      avg_ticket:   avgTicket,
      discounts:    parseFloat(salesTotals._sum.discountAmount || 0),
      tax_collected: parseFloat(taxSummary._sum.taxAmount || 0),
      tips:         parseFloat(salesTotals._sum.tipAmount || 0),
    },
    trends: {
      daily:      salesByDay.slice(0, 14), // Last 14 days
      best_day:   bestDay   ? { day: bestDay.day_name?.trim(),   revenue: parseFloat(bestDay.revenue) }   : null,
      worst_day:  worstDay  ? { day: worstDay.day_name?.trim(),  revenue: parseFloat(worstDay.revenue) }  : null,
      peak_hours: peakHours,
    },
    products: {
      top:      topProducts.map(p => ({ name: p.name, units: p.units_sold, revenue: parseFloat(p.revenue), margin_pct: parseFloat(p.margin_pct || 0) })),
      deadstock: slowProducts.map(p => ({ name: p.name, stock: p.stock, tied_capital: parseFloat(p.tied_capital) })),
    },
    inventory: {
      total_products:    parseInt(stockLevels[0]?.total_products  || 0),
      stock_value:       parseFloat(stockLevels[0]?.stock_value    || 0),
      low_stock_count:   parseInt(stockLevels[0]?.low_stock_count  || 0),
      out_of_stock:      parseInt(stockLevels[0]?.out_of_stock_count || 0),
      low_stock_items:   lowStock.map(p => ({ name: p.name, current: p.current_stock, reorder_at: p.reorder_point })),
      adjustments_count: recentAdjustments._count.id || 0,
    },
    customers: {
      unique:            parseInt(customerStats[0]?.unique_customers   || 0),
      pct_with_account:  txns > 0 ? parseFloat(((parseInt(customerStats[0]?.sales_with_customer || 0) / txns) * 100).toFixed(1)) : 0,
      avg_with_account:  parseFloat(customerStats[0]?.avg_with_customer || 0),
      avg_walk_in:       parseFloat(customerStats[0]?.avg_walk_in       || 0),
      top:               topCustomers.map(c => ({ name: c.name, visits: c.visits, spent: parseFloat(c.total_spent), points: c.loyalty_points, balance_owed: parseFloat(c.outstanding_balance || 0) })),
    },
    staff: staffStats.map(s => ({
      name:         s.name,
      sales:        s.sales_count,
      revenue:      parseFloat(s.total_revenue),
      avg_ticket:   parseFloat(s.avg_ticket),
      refunds:      s.refund_count,
    })),
    suppliers: supplierStats.map(s => ({
      name:           s.name,
      orders:         s.orders,
      avg_lead_days:  parseFloat(s.avg_lead_days || 0),
      total_ordered:  parseFloat(s.total_ordered),
    })),
    refunds: {
      count:    recentRefunds._count.id || 0,
      total:    parseFloat(recentRefunds._sum.totalRefunded || 0),
      rate_pct: refundRate,
    },
    hotel: hotelStats ? {
      reservations:    hotelStats._count.id || 0,
      room_revenue:    parseFloat(hotelStats._sum.totalRoomCharge || 0),
      deposits_paid:   parseFloat(hotelStats._sum.depositPaid    || 0),
      avg_nights:      parseFloat(hotelStats._avg.nights         || 0),
    } : null,
    restaurant: restaurantStats ? {
      orders:       restaurantStats._count.id || 0,
      revenue:      parseFloat(restaurantStats._sum.totalAmount || 0),
      avg_ticket:   parseFloat(restaurantStats._avg.totalAmount || 0),
      avg_covers:   parseFloat(restaurantStats._avg.covers      || 0),
    } : null,
  };
}

/**
 * Ask Claude a question about the merchant's business.
 *
 * @param {object} context  — output of gatherContext()
 * @param {string} question — merchant's question in any language
 * @param {object[]} history — previous messages in this conversation
 * @returns {Promise<{ answer: string, suggestedQuestions: string[] }>}
 */
async function askInsight(context, question, history = []) {
  // Deployable without a key: when no LLM is configured (or the call fails), fall
  // back to a deterministic, GL-grounded answer instead of erroring. Flips to the
  // live model automatically once ANTHROPIC_API_KEY is set.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { answer: buildDeterministicAnswer(context, question), suggestedQuestions: defaultSuggestions(), mode: 'rules' };
  }

  const systemPrompt = buildSystemPrompt(context);

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('anthropic_api_error', { status: response.status, body: err });
      // Degrade gracefully rather than 503 — the merchant still gets a useful answer.
      return { answer: buildDeterministicAnswer(context, question), suggestedQuestions: defaultSuggestions(), mode: 'rules' };
    }

    const data   = await response.json();
    const answer = data.content?.[0]?.text || '';
    const suggestedQuestions = extractSuggestions(answer, context);
    return { answer, suggestedQuestions, mode: 'ai' };
  } catch (err) {
    logger.warn('ai_fallback_to_rules', { message: err.message });
    return { answer: buildDeterministicAnswer(context, question), suggestedQuestions: defaultSuggestions(), mode: 'rules' };
  }
}

// Deterministic business briefing computed straight from the gathered GL context —
// genuinely useful with zero external dependencies; the no-key/offline fallback.
function fmt(n, ccy = '') { return `${ccy}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

function buildDeterministicAnswer(ctx, question = '') {
  const c = ctx?.meta?.currency ? ctx.meta.currency + ' ' : '';
  const r = ctx?.revenue || {};
  const parts = [];
  const arrow = r.change_pct > 0 ? `up ${r.change_pct}%` : r.change_pct < 0 ? `down ${Math.abs(r.change_pct)}%` : 'flat';
  parts.push(`Over the last ${ctx?.meta?.periodDays || 30} days you took ${fmt(r.total, c)} across ${r.transactions || 0} sales (${arrow} vs the prior period); average ticket ${fmt(r.avg_ticket, c)}.`);
  if (ctx?.trends?.best_day?.day) parts.push(`Best day was ${ctx.trends.best_day.day} (${fmt(ctx.trends.best_day.revenue, c)}).`);
  if (ctx?.products?.top?.length) { const t = ctx.products.top[0]; parts.push(`Top seller: ${t.name} (${t.units} units, ${fmt(t.revenue, c)}).`); }

  const todo = [];
  if (ctx?.inventory?.out_of_stock) todo.push(`Restock ${ctx.inventory.out_of_stock} out-of-stock product(s).`);
  if (ctx?.inventory?.low_stock_count) todo.push(`${ctx.inventory.low_stock_count} product(s) running low — reorder soon.`);
  const overdue = (ctx?.customers?.top || []).filter(x => x.balance_owed > 0);
  if (overdue.length) todo.push(`Follow up ${overdue.length} customer(s) on outstanding credit (${fmt(overdue.reduce((s, x) => s + x.balance_owed, 0), c)}).`);
  if (ctx?.refunds?.rate_pct > 5) todo.push(`Refund rate is high at ${ctx.refunds.rate_pct}% — check the cause.`);
  if (ctx?.products?.deadstock?.length) todo.push(`${ctx.products.deadstock.length} slow item(s) tying up ${fmt(ctx.products.deadstock.reduce((s, x) => s + x.tied_capital, 0), c)} — discount or clear.`);

  let out = parts.join(' ');
  if (todo.length) out += `\n\nToday's actions:\n- ${todo.join('\n- ')}`;
  return out;
}

function defaultSuggestions() {
  return ['How did sales compare to last week?', 'Which products should I reorder?', 'Who owes me money?'];
}

/**
 * Build the system prompt that tells Claude who it is and gives it the data.
 */
function buildSystemPrompt(ctx) {
  const m = ctx.meta;
  const r = ctx.revenue;
  const currency = m.currency;
  const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

  const changeStr = r.change_pct !== null
    ? (r.change_pct >= 0 ? `up ${r.change_pct}%` : `down ${Math.abs(r.change_pct)}%`)
    : 'no comparison data yet';

  let prompt = `You are Balanzify Insights — a business advisor built into the Balanzify POS system.
You help ${m.businessName}, a business in ${m.city || m.country}, understand their performance and make better decisions.

Today's date: ${m.to}
Analysis period: last ${m.periodDays} days (${m.from} to ${m.to})

MERCHANT DATA:
==============

REVENUE & SALES
Revenue this period: ${fmt(r.total)} (${changeStr} vs previous ${m.periodDays} days)
Transactions: ${r.transactions} sales | Average ticket: ${fmt(r.avg_ticket)}
Discounts given: ${fmt(r.discounts)} | Tax collected: ${fmt(r.tax_collected)}
Refund rate: ${ctx.refunds.rate_pct}% (${ctx.refunds.count} refunds, ${fmt(ctx.refunds.total)} refunded)

TRENDS
Best day: ${ctx.trends.best_day ? `${ctx.trends.best_day.day} (${fmt(ctx.trends.best_day.revenue)})` : 'insufficient data'}
Worst day: ${ctx.trends.worst_day ? `${ctx.trends.worst_day.day} (${fmt(ctx.trends.worst_day.revenue)})` : 'insufficient data'}
Peak hours: ${ctx.trends.peak_hours.map(h => `${h.hour} (${h.txns} txns)`).join(', ') || 'insufficient data'}

TOP PRODUCTS
${ctx.products.top.slice(0,5).map(p => `  ${p.name}: ${p.units} units, ${fmt(p.revenue)} revenue, ${p.margin_pct}% margin`).join('\n') || '  No sales data yet'}

DEADSTOCK (in stock, no sales this period)
${ctx.products.deadstock.length > 0 ? ctx.products.deadstock.map(p => `  ${p.name}: ${p.stock} units, ${fmt(p.tied_capital)} tied up`).join('\n') : '  None — good stock management'}

INVENTORY
Total products: ${ctx.inventory.total_products} | Stock value: ${fmt(ctx.inventory.stock_value)}
Low stock: ${ctx.inventory.low_stock_count} products | Out of stock: ${ctx.inventory.out_of_stock} products
${ctx.inventory.low_stock_items.length > 0 ? 'Low stock items: ' + ctx.inventory.low_stock_items.map(p => `${p.name} (${p.current} left)`).join(', ') : ''}
Stock adjustments this period: ${ctx.inventory.adjustments_count} (waste/damage/theft)

CUSTOMERS
Unique customers: ${ctx.customers.unique}
Customers with account: ${ctx.customers.pct_with_account}% of sales
Avg spend with account: ${fmt(ctx.customers.avg_with_account)} vs ${fmt(ctx.customers.avg_walk_in)} walk-in
${ctx.customers.top.length > 0 ? 'Top customers: ' + ctx.customers.top.map(c => `${c.name} (${c.visits} visits, ${fmt(c.spent)} total)`).join(', ') : ''}

STAFF PERFORMANCE
${ctx.staff.map(s => `  ${s.name}: ${s.sales} sales, ${fmt(s.revenue)} revenue, ${fmt(s.avg_ticket)} avg ticket, ${s.refunds} refunds`).join('\n') || '  No shift data'}

SUPPLIERS
${ctx.suppliers.map(s => `  ${s.name}: ${s.orders} orders, ${s.avg_lead_days} day avg lead time, ${fmt(s.total_ordered)} ordered`).join('\n') || '  No purchase orders this period'}
`;

  if (ctx.hotel) {
    prompt += `\nHOTEL
Reservations: ${ctx.hotel.reservations} | Room revenue: ${fmt(ctx.hotel.room_revenue)}
Average stay: ${ctx.hotel.avg_nights.toFixed(1)} nights\n`;
  }

  if (ctx.restaurant) {
    prompt += `\nRESTAURANT
Orders: ${ctx.restaurant.orders} | Revenue: ${fmt(ctx.restaurant.revenue)}
Avg ticket: ${fmt(ctx.restaurant.avg_ticket)} | Avg covers: ${ctx.restaurant.avg_covers.toFixed(1)}\n`;
  }

  prompt += `
INSTRUCTIONS
============
1. Answer in the same language the merchant writes in (Somali, Arabic, English, French, Swahili — match their language).
2. Every insight must reference specific numbers from the data above. Never make up figures.
3. Be direct and concrete. A merchant needs to know what to DO, not just what is happening.
4. Keep answers conversational — you're talking to a business owner, not writing a report.
5. If asked something the data doesn't cover, say so honestly rather than guessing.
6. Flag urgent issues immediately (critical low stock, high refund rate, deadstock tying up capital).
7. End each response with 2-3 short suggested follow-up questions relevant to what was discussed.

Format suggestions as:
💡 [Your main answer]

📊 [Key numbers]

✅ [Action to take]

❓ You could also ask me:
• [question 1]
• [question 2]
• [question 3]
`;

  return prompt;
}

/**
 * Extract suggested follow-up questions from the response.
 * Claude includes them in a specific format — parse them out.
 */
function extractSuggestions(answer, context) {
  // Try to parse questions Claude suggested
  const lines = answer.split('\n');
  const suggestions = [];
  let inSuggestions = false;

  for (const line of lines) {
    if (line.includes('❓') || line.toLowerCase().includes('you could also ask')) {
      inSuggestions = true;
      continue;
    }
    if (inSuggestions && line.trim().startsWith('•')) {
      suggestions.push(line.trim().replace(/^•\s*/, ''));
    }
    if (inSuggestions && suggestions.length >= 3) break;
  }

  // Fallback suggestions based on data if Claude didn't include any
  if (suggestions.length === 0) {
    if (context.inventory.low_stock_count > 0) {
      suggestions.push(`Which ${context.inventory.low_stock_count} products are running low?`);
    }
    if (context.products.deadstock.length > 0) {
      suggestions.push('Which products have not sold at all this month?');
    }
    if (context.revenue.change_pct !== null && context.revenue.change_pct < 0) {
      suggestions.push('What caused my revenue to drop compared to last month?');
    }
    suggestions.push('Who are my best customers this month?');
    suggestions.push('Which days should I run promotions?');
    suggestions.push('How is my staff performing?');
  }

  return suggestions.slice(0, 3);
}

/**
 * Generate a daily briefing — proactive insights sent every morning.
 * Called by a scheduled job or manually by the merchant.
 *
 * @param {string} businessId
 * @returns {Promise<{ briefing: string, urgent: string[] }>}
 */
async function generateDailyBriefing(businessId) {
  const context = await gatherContext(businessId, { days: 7 });
  const question = 'Give me a brief morning summary of my business. What do I need to know and do today?';
  const { answer, mode } = await askInsight(context, question);

  // Extract urgent items
  const urgent = [];
  if (context.inventory.out_of_stock > 0) {
    urgent.push(`${context.inventory.out_of_stock} products are out of stock`);
  }
  if (context.inventory.low_stock_count > 0) {
    urgent.push(`${context.inventory.low_stock_count} products running low`);
  }
  if (context.refunds.rate_pct > 5) {
    urgent.push(`High refund rate: ${context.refunds.rate_pct}%`);
  }
  if (context.customers.top.some(c => c.balance_owed > 0)) {
    const overdue = context.customers.top.filter(c => c.balance_owed > 0);
    urgent.push(`${overdue.length} customers with outstanding credit balances`);
  }

  return { briefing: answer, urgent, mode };
}

module.exports = { gatherContext, askInsight, generateDailyBriefing };
