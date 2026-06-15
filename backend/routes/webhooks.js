/**
 * Webhook Management Routes
 *
 * GET    /api/v1/webhooks              — list endpoints
 * POST   /api/v1/webhooks              — register endpoint
 * PUT    /api/v1/webhooks/:id          — update endpoint
 * DELETE /api/v1/webhooks/:id          — deactivate
 * POST   /api/v1/webhooks/:id/test     — send test event
 * GET    /api/v1/webhooks/:id/deliveries — delivery history
 * GET    /api/v1/webhooks/events       — list available event types
 */
 
const express = require('express');
const crypto  = require('crypto');
const { z }   = require('zod');
const prisma  = require('../lib/prisma');
const { emit, VALID_EVENTS } = require('../lib/webhooks');
const { auth, requireRole }  = require('../middleware/auth');
const { validate }           = require('../middleware/validate');
const router = express.Router();

const EndpointSchema = z.object({
  url:         z.string().url('Must be a valid HTTPS URL').refine(u => u.startsWith('https://'), 'URL must use HTTPS'),
  events:      z.array(z.string()).min(1).refine(
    evts => evts.every(e => e === '*' || VALID_EVENTS.has(e)),
    'One or more invalid event types'
  ),
  description: z.string().trim().max(255).optional().nullable(),
  isActive:    z.boolean().default(true),
});

// GET /api/v1/webhooks/events — list all event types merchants can subscribe to
router.get('/events', auth, (req, res) => {
  res.json({
    events: [...VALID_EVENTS].map(e => ({
      event:       e,
      description: EVENT_DESCRIPTIONS[e] || '',
    })),
  });
});

const EVENT_DESCRIPTIONS = {
  'sale.completed':          'Fired when a sale is successfully completed at the POS',
  'sale.refunded':           'Fired when a full or partial refund is processed',
  'stock.low':               'Fired when a product\'s stock drops to or below its reorder point',
  'stock.out':               'Fired when a product\'s stock reaches zero',
  'purchase_order.received': 'Fired when goods are received against a purchase order',
  'purchase_order.approved': 'Fired when a purchase order is approved',
  'customer.credit_exceeded':'Fired when a customer\'s credit limit is approached (>80%)',
  'shift.closed':            'Fired when a cashier closes their shift',
  'payment.pending':         'Fired when an async payment (M-Pesa, ACH) is initiated',
  'payment.completed':       'Fired when a pending payment is confirmed',
  'payment.failed':          'Fired when a pending payment fails',
};

// GET /api/v1/webhooks
router.get('/', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { businessId: req.user.business_id },
      select: {
        id: true, url: true, events: true, description: true, isActive: true,
        successCount: true, failureCount: true, lastSuccessAt: true, lastFailureAt: true, createdAt: true,
        // Never return the secret — not even to the owner
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ endpoints });
  } catch (err) { next(err); }
});

// POST /api/v1/webhooks
router.post('/', auth, requireRole('owner'), validate(EndpointSchema), async (req, res, next) => {
  try {
    const secret   = crypto.randomBytes(32).toString('hex');
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        businessId:  req.user.business_id,
        url:         req.body.url,
        secret,
        events:      req.body.events,
        description: req.body.description || null,
        isActive:    req.body.isActive ?? true,
      },
      select: {
        id: true, url: true, events: true, description: true, isActive: true, createdAt: true,
        secret: true,  // Return secret ONLY on creation — never again
      },
    });
    res.status(201).json({
      ...endpoint,
      _note: 'Save the secret now — it will never be shown again. Use it to verify the X-Balanzify-Signature header.',
    });
  } catch (err) { next(err); }
});

// PUT /api/v1/webhooks/:id
router.put('/:id', auth, requireRole('owner'), validate(EndpointSchema.partial()), async (req, res, next) => {
  try {
    const count = await prisma.webhookEndpoint.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: {
        ...(req.body.url         !== undefined && { url:         req.body.url }),
        ...(req.body.events      !== undefined && { events:      req.body.events }),
        ...(req.body.description !== undefined && { description: req.body.description }),
        ...(req.body.isActive    !== undefined && { isActive:    req.body.isActive }),
      },
    });
    if (!count.count) return res.status(404).json({ title: 'Not found', status: 404 });
    const updated = await prisma.webhookEndpoint.findUnique({
      where: { id: req.params.id },
      select: { id: true, url: true, events: true, description: true, isActive: true, updatedAt: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/v1/webhooks/:id/rotate-secret — generate a new secret
router.post('/:id/rotate-secret', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const secret = crypto.randomBytes(32).toString('hex');
    const count  = await prisma.webhookEndpoint.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { secret },
    });
    if (!count.count) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json({ secret, _note: 'Update your endpoint to use the new secret immediately. Old secret is now invalid.' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/webhooks/:id
router.delete('/:id', auth, requireRole('owner'), async (req, res, next) => {
  try {
    await prisma.webhookEndpoint.updateMany({
      where: { id: req.params.id, businessId: req.user.business_id },
      data: { isActive: false },
    });
    res.json({ message: 'Webhook endpoint deactivated.' });
  } catch (err) { next(err); }
});

// POST /api/v1/webhooks/:id/test — send a test ping
router.post('/:id/test', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!endpoint) return res.status(404).json({ title: 'Not found', status: 404 });
    // Emit test event immediately
    await emit(req.user.business_id, 'sale.completed', {
      _test: true,
      message: 'This is a test event from Balanzify',
      endpoint_id: endpoint.id,
      sent_at: new Date().toISOString(),
    });
    res.json({ message: 'Test event sent. Check delivery history.' });
  } catch (err) { next(err); }
});

// GET /api/v1/webhooks/:id/deliveries
router.get('/:id/deliveries', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { endpointId: req.params.id, businessId: req.user.business_id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, event: true, deliveryId: true, status: true,
        statusCode: true, durationMs: true, attemptCount: true,
        lastAttemptAt: true, nextRetryAt: true, createdAt: true,
        responseBody: true,
      },
    });
    res.json({ deliveries });
  } catch (err) { next(err); }
});

module.exports = router;
