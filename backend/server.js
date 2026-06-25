require('dotenv').config();
require('express-async-errors'); // patches async route errors into Express error handler

// Postgres COUNT()/SUM() come back from $queryRaw as BigInt, which JSON.stringify
// can't serialize — make BigInt JSON-safe globally (reports, dashboards, etc.).
if (typeof BigInt.prototype.toJSON !== 'function') {
  BigInt.prototype.toJSON = function () { return Number(this); };
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { requestLogger, logger } = require('./lib/logger');
const { connectRedis } = require('./lib/redis');
const { authLimiter, apiLimiter } = require('./lib/rateLimiter');
const { metricsMiddleware, exportMetrics } = require('./lib/metrics');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Bootstrap payment provider registry
try {
  require('./lib/payments');
} catch (paymentErr) {
  console.error("❌ CRITICAL ERROR BOOTSTRAPPING PAYMENTS REGISTRY:");
  console.error(paymentErr);
}

// ── Startup config guard — fail fast on missing/weak secrets ──────────────────
// A misconfigured JWT_SECRET silently breaks auth at first login (runtime),
// not at boot. Validate critical config up front so deploys fail loudly.
(function validateConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET || '';
  const weak = !secret || secret.length < 32 || /^change[_-]?me$/i.test(secret);
  if (weak) {
    const msg = '❌ JWT_SECRET is missing or weak (need ≥32 chars). Generate with: openssl rand -hex 64';
    if (isProd) { console.error(msg); process.exit(1); }
    else { console.warn('⚠️  ' + msg + ' — continuing in non-production.'); }
  }
  if (isProd && (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').split(',').filter(Boolean).length === 0) {
    console.error('❌ No ALLOWED_ORIGINS/FRONTEND_URL set in production — all cross-origin requests will be denied.');
    process.exit(1);
  }
})();

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').split(',').filter(Boolean);
// CORS — restrict to configured origins in production.
// Uses allowedOrigins defined above (from ALLOWED_ORIGINS / FRONTEND_URL).
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    // In development, allow everything
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    // In production, only allow explicitly configured origins. Fail CLOSED:
    // if ALLOWED_ORIGINS/FRONTEND_URL is misconfigured (empty), deny rather
    // than silently allowing every site to make credentialed requests.
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-trace-id'],
  exposedHeaders: ['x-trace-id','x-ratelimit-remaining'],
}));

// ── Body parsing and compression ──────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '5mb', verify: (req, res, buf) => { if (req.originalUrl === '/api/v1/billing/webhook') req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Health & readiness probes (required by Docker HEALTHCHECK + docker-compose) ─
// /health  — liveness: is the process up? (no dependencies)
// /ready   — readiness: can it serve traffic? (checks DB)
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() }));
app.get('/ready', async (req, res) => {
  try {
    const prisma = require('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', db: 'disconnected' });
  }
});

// ── Trust proxy (for correct IP behind Nginx) ─────────────────────────────────
app.set('trust proxy', 1);

// ── Request tracing, metrics, and tracking ID ─────────────────────────────────
app.use((req, res, next) => {
  req.id = uuidv4(); // Assign unique request ID tracking
  next();
});
app.use(requestLogger);
app.use(metricsMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────
try {
  const authRoutes = require('./routes/auth');
  const productRoutes = require('./routes/products');
  const variantRoutes = require('./routes/variants');
  const salesRoutes = require('./routes/sales');
  const purchaseOrderRoutes = require('./routes/purchaseOrders');
  const exportRoutes  = require('./routes/exports');
  const accountingRoutes = require('./routes/accounting');
  const lendingRoutes = require('./routes/lending');
  const paymentRoutes  = require('./routes/payments');
  const taxRoutes      = require('./routes/tax');
  const webhookRoutes  = require('./routes/webhooks');
  const hotelRoutes      = require('./routes/hotel');
  const hrmRoutes        = require('./routes/hrm');
  const superadminRoutes = require('./routes/superadmin');
  const restaurantRoutes = require('./routes/restaurant');
  const checkoutRoutes   = require('./routes/checkout');
  const insightsRoutes   = require('./routes/insights');
  const pharmacyRoutes = require('./routes/pharmacy');
  const modulesRoutes  = require('./routes/modules');
  const wholesaleRoutes = require('./routes/wholesale');
  const constructionRoutes = require('./routes/construction');
  const billingRoutes  = require('./routes/billing');
  const { requireModule } = require('./lib/moduleGate');
  // requireModule needs req.user, so auth must run at the mount (before the
  // router's own per-route auth) — otherwise the gate sees no user and bypasses.
  const { auth: gateAuth } = require('./middleware/auth');
  const creditRoutes     = require('./routes/credit');
  const uploadRoutes = require('./routes/uploads');
  const stocktakeRoutes = require('./routes/stocktake');
  const currencyRoutes = require('./routes/currency');
  const {
    couponsRouter, loyaltyRouter, pettyCashRouter, bundlesRouter,
    labelsRouter, whatsappRouter, supplierCatalogRouter,
    scheduledReportsRouter, customerSegmentsRouter,
  } = require('./routes/features');
  const {
    suppliersRouter, stockRouter, tasksRouter, projectsRouter,
    reportsRouter, usersRouter, categoriesRouter, locationsRouter,
    customersRouter, settingsRouter, notificationsRouter,
    expensesRouter, expenseCategoriesRouter, paymentAccountsRouter,
    customerGroupsRouter, unitsRouter, brandsRouter, variationsRouter,
    discountsRouter, priceGroupsRouter, invoiceLayoutsRouter, invoiceSchemesRouter,
    serviceTypesRouter,
  } = require('./routes/combined');

  // Complete API v1 Routes Checklist with correct rate limiters mapped
  app.use('/api/v1/auth', authLimiter, authRoutes);
  app.use('/api/v1/products', apiLimiter, productRoutes);
  app.use('/api/v1/products/:productId/variants', apiLimiter, variantRoutes);
  app.use('/api/v1/sales', apiLimiter, salesRoutes);
  app.use('/api/v1/purchase-orders', apiLimiter, purchaseOrderRoutes);
  app.use('/api/v1/suppliers/:supplierId/catalog', apiLimiter, supplierCatalogRouter);
  app.use('/api/v1/payments', apiLimiter, paymentRoutes);
  app.use('/api/v1/tax',      apiLimiter, taxRoutes);
  app.use('/api/v1/webhooks', apiLimiter, webhookRoutes);
  app.use('/api/v1/hotel',      apiLimiter, gateAuth, requireModule('hotel'), hotelRoutes);
  app.use('/api/v1/hrm',        apiLimiter, gateAuth, requireModule('hrm'), hrmRoutes);
  app.use('/api/v1/superadmin', apiLimiter, gateAuth, requireModule('superadmin'), superadminRoutes);
  app.use('/api/v1/restaurant', apiLimiter, gateAuth, requireModule('restaurant'), restaurantRoutes);
  app.use('/api/v1/service-types', apiLimiter, gateAuth, requireModule('restaurant'), serviceTypesRouter);
  app.use('/api/v1/pharmacy',   apiLimiter, gateAuth, requireModule('pharmacy'), pharmacyRoutes);
  app.use('/api/v1/modules',    apiLimiter, modulesRoutes);
  // Stripe webhook first (raw body via the express.json verify hook), then the rest.
  app.post('/api/v1/billing/webhook', billingRoutes.webhook);
  app.use('/api/v1/billing',    apiLimiter, billingRoutes);
  app.use('/api/v1/wholesale',  apiLimiter, gateAuth, requireModule('wholesale'), wholesaleRoutes);
  app.use('/api/v1/construction', apiLimiter, gateAuth, requireModule('construction'), constructionRoutes);
  app.use('/api/v1/delivery', apiLimiter, gateAuth, requireModule('delivery'), require('./routes/delivery'));
  app.use('/api/v1/checkout',   apiLimiter, checkoutRoutes);
  app.use('/api/v1/insights',   apiLimiter, gateAuth, requireModule('insights'), insightsRoutes);
  app.use('/api/v1/credit',     apiLimiter, gateAuth, requireModule('credit'), creditRoutes);
  app.use('/api/v1/savings',    apiLimiter, gateAuth, requireModule('savings'), require('./routes/savings'));
  app.use('/api/v1/forecast',   apiLimiter, require('./routes/forecast'));
  app.use('/api/v1/asset-finance', apiLimiter, gateAuth, requireModule('asset_finance'), require('./routes/assetFinance'));
  app.use('/api/v1/wallet',     apiLimiter, gateAuth, requireModule('wallet'), require('./routes/wallet'));

  // Public diaspora payment pages — no auth, token is unguessable
  app.use('/pay', creditRoutes);
  
  // Public digital receipt — no auth, no rate limit (token is unguessable)
  app.use('/r', checkoutRoutes);
  
  app.use('/api/v1/sync', apiLimiter, require('./routes/sync'));
  const fiscalRoutes = require('./routes/fiscal');
  app.use('/api/v1/fiscal', apiLimiter, fiscalRoutes);
  app.use('/fiscal', fiscalRoutes.publicRouter); // public QR verification
  app.use('/api/v1/shop', apiLimiter, require('./routes/shop')); // public consumer ordering (no auth)
  app.use('/api/v1/islamic', apiLimiter, require('./routes/islamic'));
  app.use('/api/v1/export', apiLimiter, exportRoutes);
  app.use('/api/v1/accounting', apiLimiter, accountingRoutes);
  app.use('/api/v1/lending', apiLimiter, lendingRoutes);
  app.use('/api/v1/upload', apiLimiter, uploadRoutes);
  app.use('/api/v1/stocktake', apiLimiter, stocktakeRoutes);
  app.use('/api/v1/currency', apiLimiter, currencyRoutes);
  app.use('/api/v1/coupons', apiLimiter, couponsRouter);
  app.use('/api/v1/loyalty', apiLimiter, loyaltyRouter);
  app.use('/api/v1/petty-cash', apiLimiter, pettyCashRouter);
  app.use('/api/v1/bundles', apiLimiter, bundlesRouter);
  app.use('/api/v1/labels', apiLimiter, labelsRouter);
  app.use('/api/v1/whatsapp', apiLimiter, whatsappRouter);
  app.use('/api/v1/scheduled-reports', apiLimiter, scheduledReportsRouter);
  app.use('/api/v1/customer-segments', apiLimiter, customerSegmentsRouter);
  app.use('/api/v1/suppliers', apiLimiter, suppliersRouter);
  app.use('/api/v1/stock', apiLimiter, stockRouter);
  app.use('/api/v1/tasks', apiLimiter, tasksRouter);
  app.use('/api/v1/projects', apiLimiter, projectsRouter);
  app.use('/api/v1/reports', apiLimiter, reportsRouter);
  app.use('/api/v1/users', apiLimiter, usersRouter);
  app.use('/api/v1/categories', apiLimiter, categoriesRouter);
  app.use('/api/v1/locations', apiLimiter, locationsRouter);
  app.use('/api/v1/customers', apiLimiter, customersRouter);
  app.use('/api/v1/settings', apiLimiter, settingsRouter);
  app.use('/api/v1/notifications', apiLimiter, notificationsRouter);
  app.use('/api/v1/expenses', apiLimiter, expensesRouter);
  app.use('/api/v1/expense-categories', apiLimiter, expenseCategoriesRouter);
  app.use('/api/v1/payment-accounts', apiLimiter, paymentAccountsRouter);
  app.use('/api/v1/customer-groups', apiLimiter, customerGroupsRouter);
  app.use('/api/v1/units', apiLimiter, unitsRouter);
  app.use('/api/v1/brands', apiLimiter, brandsRouter);
  app.use('/api/v1/variations', apiLimiter, variationsRouter);
  app.use('/api/v1/discounts', apiLimiter, discountsRouter);
  app.use('/api/v1/price-groups', apiLimiter, priceGroupsRouter);
  app.use('/api/v1/invoice-layouts', apiLimiter, invoiceLayoutsRouter);
  app.use('/api/v1/invoice-schemes', apiLimiter, invoiceSchemesRouter);

} catch (routeError) {
  console.error("❌ CRITICAL ERROR IMPORTING API ROUTES:");
  console.error(routeError);
  process.exit(1);
}


// ── 404 and error handlers (must be last) ─────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Startup Execution ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
let server;

if (require.main === module || process.env.NODE_ENV !== 'test') {
  try {
    server = app.listen(PORT, async () => {
      console.log(`>>> Initializing server infrastructure on port ${PORT}...`);
      logger.info(`Balanzify v2 running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      
      // Redis Pipeline Track
      await connectRedis()
        .then(() => console.log(">>> Redis Engine Status: Connected"))
        .catch((err) => console.error("❌ Redis Engine Status: Connection Failed ->", err.message));
      
      // Email Pipeline Track
      try {
        const { verifyEmailConfig } = require('./lib/email'); 
        await verifyEmailConfig();
        console.log(">>> Mail SMTP Server Status: Verified");
      } catch (emailErr) {
        console.error("❌ Mail SMTP Server Status: Verification Failed ->", emailErr.message);
      }

      try {
        const { backfillMarketTaxRates } = require('./lib/marketTax');
        await backfillMarketTaxRates();
        console.log('>>> Market tax rates: synced');
      } catch (taxErr) {
        console.error('❌ Market tax rate sync failed ->', taxErr.message);
      }
    });

    // Graceful shutdown: stop accepting connections, disconnect Prisma, exit.
    const shutdown = async (signal) => {
      console.log(`>>> ${signal} received — shutting down gracefully...`);
      try {
        if (server) {
          await new Promise((resolve) => server.close(resolve));
          console.log('>>> HTTP server closed');
        }
        try {
          const prisma = require('./lib/prisma');
          await prisma.$disconnect();
          console.log('>>> Database disconnected');
        } catch { /* prisma may not be initialized */ }
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (startupError) {
    console.error("❌ CRITICAL ERROR DURING LISTENING INSTANTIATION:");
    console.error(startupError);
    process.exit(1);
  }
}

// ── Global Safety Hooks for Uncaught/Silent Anomalies ────────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 CRITICAL UNCAUGHT SYSTEM EXCEPTION DETECTED:');
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 CRITICAL UNHANDLED ASYNC REJECTION DETECTED:');
  console.error(reason);
  process.exit(1);
});

module.exports = { app, server };