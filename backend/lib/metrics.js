/**
 * Lightweight Prometheus-compatible metrics collector.
 * Does not require the prom-client package — stores counters in memory
 * and exports in text format. For production, swap in prom-client if needed.
 *
 * Metrics exposed at GET /metrics (internal only — blocked at Nginx for external traffic).
 */

const prisma = require('./prisma');

// ── In-memory metric stores ───────────────────────────────────────────────────
const counters = {};
const histograms = {};
const gauges = {};

const inc = (name, labels = {}, value = 1) => {
  const key = metricKey(name, labels);
  counters[key] = (counters[key] || 0) + value;
};

const observe = (name, labels = {}, value) => {
  const key = metricKey(name, labels);
  if (!histograms[key]) histograms[key] = { sum: 0, count: 0, buckets: {} };
  histograms[key].sum += value;
  histograms[key].count += 1;
  // Buckets: 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
  for (const bucket of [50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
    if (value <= bucket) histograms[key].buckets[bucket] = (histograms[key].buckets[bucket] || 0) + 1;
  }
};

const setGauge = (name, labels = {}, value) => {
  gauges[metricKey(name, labels)] = value;
};

const metricKey = (name, labels) => {
  const l = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
  return l ? `${name}{${l}}` : name;
};

// ── Request metrics middleware ─────────────────────────────────────────────────
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path.replace(/\/[0-9a-f-]{36}/g, '/:id');
    inc('http_requests_total', { method: req.method, route, status: res.statusCode });
    observe('http_request_duration_ms', { method: req.method, route }, duration);
    if (res.statusCode >= 500) inc('http_errors_total', { method: req.method, route, status: res.statusCode });
  });
  next();
};

// ── Business metrics ──────────────────────────────────────────────────────────
// Called from relevant routes to track business-level KPIs
const trackSale = (amount, paymentMethod) => {
  inc('sales_total_count');
  inc('sales_by_payment_method', { method: paymentMethod });
  observe('sale_amount_usd', {}, parseFloat(amount) || 0);
};

const trackLogin = (success, method = 'password') => {
  inc('auth_attempts_total', { success: success ? 'true' : 'false', method });
};

const trackFraudSignal = (type) => {
  inc('fraud_signals_total', { type });
};

// ── Collect system metrics ────────────────────────────────────────────────────
const collectSystemMetrics = async () => {
  const mem = process.memoryUsage();
  setGauge('process_memory_rss_bytes', {}, mem.rss);
  setGauge('process_memory_heap_used_bytes', {}, mem.heapUsed);
  setGauge('process_memory_heap_total_bytes', {}, mem.heapTotal);
  setGauge('process_uptime_seconds', {}, process.uptime());

  try {
    const dbStat = pool.totalCount !== undefined
      ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
      : { total: 0, idle: 0, waiting: 0 };
    setGauge('db_pool_total_connections', {}, dbStat.total);
    setGauge('db_pool_idle_connections', {}, dbStat.idle);
    setGauge('db_pool_waiting_requests', {}, dbStat.waiting);

    const dbPing = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    observe('db_query_duration_ms', { query: 'ping' }, Date.now() - dbPing);
    setGauge('db_connected', {}, 1);
  } catch {
    setGauge('db_connected', {}, 0);
  }
};

// Collect every 15 seconds
setInterval(collectSystemMetrics, 15000);

// ── Prometheus text format exporter ──────────────────────────────────────────
const exportMetrics = () => {
  const lines = [];
  const ts = Date.now();

  for (const [key, value] of Object.entries(counters)) {
    lines.push(`# TYPE ${key.split('{')[0]} counter`);
    lines.push(`${key} ${value} ${ts}`);
  }
  for (const [key, value] of Object.entries(gauges)) {
    lines.push(`# TYPE ${key.split('{')[0]} gauge`);
    lines.push(`${key} ${value} ${ts}`);
  }
  for (const [key, hist] of Object.entries(histograms)) {
    const name = key.split('{')[0];
    const labelPart = key.includes('{') ? key.slice(key.indexOf('{')) : '';
    lines.push(`# TYPE ${name} histogram`);
    for (const [bucket, count] of Object.entries(hist.buckets)) {
      lines.push(`${name}_bucket{le="${bucket}"${labelPart ? ',' + labelPart.slice(1) : ''}} ${count} ${ts}`);
    }
    lines.push(`${name}_bucket{le="+Inf"${labelPart ? ',' + labelPart.slice(1) : ''}} ${hist.count} ${ts}`);
    lines.push(`${name}_sum${labelPart} ${hist.sum} ${ts}`);
    lines.push(`${name}_count${labelPart} ${hist.count} ${ts}`);
  }

  return lines.join('\n');
};

module.exports = { metricsMiddleware, exportMetrics, trackSale, trackLogin, trackFraudSignal, inc, observe, setGauge };
