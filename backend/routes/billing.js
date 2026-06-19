/**
 * Module billing — buy/cancel paid add-on subscriptions.
 *   GET  /api/v1/billing/status         — which providers are available
 *   GET  /api/v1/billing/subscriptions  — this business's add-on subs
 *   POST /api/v1/billing/checkout       — start a checkout for a module (→ url)
 *   POST /api/v1/billing/cancel         — cancel a module's subscription
 *   POST /api/v1/billing/webhook        — provider webhook (raw body; see server.js)
 *
 * Provider-agnostic: Stripe is the first implementation. A superadmin can still
 * enable modules for free (see /superadmin/business/:id/modules), so billing is
 * never the only way to turn a module on.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { MODULES, modulePrice } = require('../lib/modules');
const { getStripe, providers, hasProvider } = require('../lib/billing');
const { requireModule } = require('../lib/moduleGate');
const { logger } = require('../lib/logger');

const router = express.Router();
const APP_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

// ── module enable/disable (mirrors the superadmin/own toggle; keeps base plan) ─
async function setModuleEnabled(businessId, key, on) {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { enabledModules: true } });
  const set = new Set(biz?.enabledModules || []);
  // never strip the always-on base plan
  Object.keys(MODULES).filter((k) => MODULES[k].default !== false).forEach((k) => set.add(k));
  if (on) set.add(key); else set.delete(key);
  await prisma.business.update({ where: { id: businessId }, data: { enabledModules: [...set] } });
  requireModule.invalidate(businessId);
}

const paidModule = (key) => MODULES[key] && MODULES[key].default === false;

// ── status ─────────────────────────────────────────────────────────
router.get('/status', auth, (req, res) => {
  res.json({ providers: providers(), configured: providers().length > 0 });
});

router.get('/subscriptions', auth, async (req, res, next) => {
  try {
    const subs = await prisma.moduleSubscription.findMany({ where: { businessId: req.user.business_id } });
    res.json({ subscriptions: subs.map((s) => ({ module: s.module, status: s.status, price_monthly: parseFloat(s.priceMonthly), current_period_end: s.currentPeriodEnd })) });
  } catch (err) { next(err); }
});

// ── start checkout ─────────────────────────────────────────────────
router.post('/checkout', auth, requireRole('owner', 'manager'), validate(z.object({
  module: z.string(),
  provider: z.string().default('stripe'),
})), async (req, res, next) => {
  try {
    const key = req.body.module;
    if (!paidModule(key)) return res.status(400).json({ title: 'Not a paid add-on module', status: 400 });
    const price = modulePrice(key);
    if (price <= 0) return res.status(400).json({ title: 'Module has no price', status: 400 });
    if (req.body.provider !== 'stripe') return res.status(501).json({ title: `Provider '${req.body.provider}' is not available yet`, status: 501 });
    if (!hasProvider('stripe')) return res.status(503).json({ title: 'Billing is not set up yet', status: 503, code: 'BILLING_NOT_CONFIGURED' });

    const stripe = getStripe();
    const mod = MODULES[key];

    // Reuse one Stripe customer per business.
    const existing = await prisma.moduleSubscription.findFirst({ where: { businessId: req.user.business_id, stripeCustomerId: { not: null } } });
    let customerId = existing?.stripeCustomerId;
    if (!customerId) {
      const biz = await prisma.business.findUnique({ where: { id: req.user.business_id } });
      const customer = await stripe.customers.create({ email: biz?.email || undefined, name: biz?.name || undefined, metadata: { businessId: req.user.business_id } });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: { name: `${mod.name} — Balanzify add-on` },
          unit_amount: Math.round(price * 100),
          recurring: { interval: 'month' },
        },
      }],
      metadata: { businessId: req.user.business_id, module: key },
      subscription_data: { metadata: { businessId: req.user.business_id, module: key } },
      success_url: `${APP_URL}/modules?billing=success&module=${encodeURIComponent(key)}`,
      cancel_url: `${APP_URL}/modules?billing=cancel`,
    });

    // Track a pending record (becomes active when the webhook confirms payment).
    await prisma.moduleSubscription.upsert({
      where: { businessId_module: { businessId: req.user.business_id, module: key } },
      create: { businessId: req.user.business_id, module: key, stripeCustomerId: customerId, status: 'incomplete', priceMonthly: price },
      update: { stripeCustomerId: customerId, status: 'incomplete', priceMonthly: price },
    });

    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// ── cancel ─────────────────────────────────────────────────────────
router.post('/cancel', auth, requireRole('owner', 'manager'), validate(z.object({ module: z.string() })), async (req, res, next) => {
  try {
    const key = req.body.module;
    const sub = await prisma.moduleSubscription.findUnique({ where: { businessId_module: { businessId: req.user.business_id, module: key } } });
    // Cancel any live Stripe subscription; a free/admin-enabled module just turns off.
    if (sub && sub.stripeSubscriptionId && getStripe()) {
      try { await getStripe().subscriptions.cancel(sub.stripeSubscriptionId); } catch (e) { logger.warn('stripe_cancel_failed', { message: e.message }); }
    }
    await setModuleEnabled(req.user.business_id, key, false);
    if (sub) await prisma.moduleSubscription.update({ where: { id: sub.id }, data: { status: 'canceled' } });
    res.json({ message: 'Module turned off.' });
  } catch (err) { next(err); }
});

// ── webhook handler (raw body — registered in server.js before express.json) ──
async function webhook(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(503).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('stripe_webhook_bad_signature', { message: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const businessId = s.metadata && s.metadata.businessId;
      const key = s.metadata && s.metadata.module;
      if (businessId && key) {
        await setModuleEnabled(businessId, key, true);
        await prisma.moduleSubscription.upsert({
          where: { businessId_module: { businessId, module: key } },
          create: { businessId, module: key, stripeCustomerId: s.customer, stripeSubscriptionId: s.subscription, status: 'active', priceMonthly: modulePrice(key) },
          update: { stripeCustomerId: s.customer, stripeSubscriptionId: s.subscription, status: 'active' },
        });
        logger.info('module_subscription_active', { businessId, module: key });
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const businessId = sub.metadata && sub.metadata.businessId;
      const key = sub.metadata && sub.metadata.module;
      if (businessId && key) {
        await setModuleEnabled(businessId, key, false);
        await prisma.moduleSubscription.updateMany({ where: { businessId, module: key }, data: { status: 'canceled' } });
      }
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('stripe_webhook_handler_error', { message: err.message });
    res.status(500).end();
  }
}

module.exports = router;
module.exports.webhook = webhook;
