/**
 * Outbound Webhook System
 *
 * Merchants register URLs to receive real-time events from Balanzify.
 * When a sale completes, stock runs low, a PO is received, etc.,
 * Balanzify POSTs a signed JSON payload to every registered endpoint.
 *
 * Signature: HMAC-SHA256 of the raw body, using the webhook's secret.
 * Header: X-Balanzify-Signature: sha256=<hex>
 * Header: X-Balanzify-Event: sale.completed
 * Header: X-Balanzify-Delivery: <uuid>
 *
 * Retry: exponential backoff, 5 attempts, gives up after 24h.
 * Failures logged to WebhookDelivery table for merchant inspection.
 *
 * Available events:
 *   sale.completed       sale.refunded
 *   stock.low            stock.out
 *   purchase_order.received  purchase_order.approved
 *   customer.credit_exceeded
 *   shift.closed
 */

const crypto  = require('crypto');
const { logger } = require('./logger');
const prisma  = require('./prisma');

// Events the system can emit — anything not in this list is rejected
const VALID_EVENTS = new Set([
  'sale.completed',
  'sale.refunded',
  'stock.low',
  'stock.out',
  'purchase_order.received',
  'purchase_order.approved',
  'customer.credit_exceeded',
  'shift.closed',
  'payment.pending',
  'payment.completed',
  'payment.failed',
  'reservation.created',
  'reservation.checked_in',
  'reservation.checked_out',
  'reservation.cancelled',
  'folio.settled',
]);

/**
 * Emit an event to all registered webhook endpoints for a business.
 * Non-blocking — failures don't affect the request that triggered the event.
 *
 * @param {string} businessId
 * @param {string} event      - e.g. 'sale.completed'
 * @param {object} payload    - the event data
 */
async function emit(businessId, event, payload) {
  if (!VALID_EVENTS.has(event)) {
    logger.warn('webhook_invalid_event', { event });
    return;
  }

  // Find all active endpoints for this business subscribed to this event
  let endpoints;
  try {
    endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        businessId,
        isActive: true,
        OR: [
          { events: { has: event } },
          { events: { has: '*' } },   // '*' = subscribe to all events
        ],
      },
    });
  } catch (err) {
    logger.error('webhook_load_endpoints_failed', { businessId, event, message: err.message });
    return;
  }

  if (!endpoints.length) return;

  const body = JSON.stringify({
    id:         crypto.randomUUID(),
    event,
    created_at: new Date().toISOString(),
    business_id: businessId,
    data:       payload,
  });

  // Fire all deliveries concurrently, don't await
  endpoints.forEach(endpoint => deliverAsync(endpoint, event, body));
}

async function deliverAsync(endpoint, event, body) {
  const deliveryId = crypto.randomUUID();
  const sig = `sha256=${crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex')}`;

  // Track delivery attempt
  let delivery;
  try {
    delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        businessId: endpoint.businessId,
        event,
        deliveryId,
        payload:    body,
        status:     'pending',
      },
    });
  } catch (err) {
    logger.error('webhook_delivery_create_failed', { endpoint: endpoint.url, message: err.message });
    return;
  }

  await attemptDelivery(delivery, endpoint, body, sig, 0);
}

const RETRY_DELAYS_MS = [0, 5000, 30000, 300000, 1800000]; // 0s, 5s, 30s, 5m, 30m

async function attemptDelivery(delivery, endpoint, body, sig, attempt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  const start = Date.now();
  let statusCode, responseBody, error;

  try {
    const res = await fetch(endpoint.url, {
      method:  'POST',
      headers: {
        'Content-Type':            'application/json',
        'X-Balanzify-Signature':   sig,
        'X-Balanzify-Event':       delivery.event,
        'X-Balanzify-Delivery':    delivery.deliveryId,
        'User-Agent':              'Balanzify-Webhooks/1.0',
      },
      body,
      signal: controller.signal,
    });
    statusCode   = res.status;
    responseBody = await res.text().catch(() => '');
  } catch (err) {
    error = err.name === 'AbortError' ? 'Timeout after 10s' : err.message;
    statusCode = 0;
  } finally {
    clearTimeout(timeout);
  }

  const duration = Date.now() - start;
  const success  = statusCode >= 200 && statusCode < 300;

  // Update delivery record
  try {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status:       success ? 'delivered' : attempt < RETRY_DELAYS_MS.length - 1 ? 'retrying' : 'failed',
        statusCode,
        responseBody: responseBody?.slice(0, 500) || error || null,
        durationMs:   duration,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        nextRetryAt:   !success && attempt < RETRY_DELAYS_MS.length - 1
          ? new Date(Date.now() + RETRY_DELAYS_MS[attempt + 1])
          : null,
      },
    });
  } catch (updateErr) {
    logger.error('webhook_delivery_update_failed', { message: updateErr.message });
  }

  logger.info('webhook_delivery_attempt', {
    url: endpoint.url, event: delivery.event, attempt,
    status: statusCode, duration, success,
  });

  // Retry if failed and retries remaining
  if (!success && attempt < RETRY_DELAYS_MS.length - 1) {
    setTimeout(() => attemptDelivery(delivery, endpoint, body, sig, attempt + 1), RETRY_DELAYS_MS[attempt + 1]);
  }

  // Update endpoint success/failure stats
  try {
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: success
        ? { successCount: { increment: 1 }, lastSuccessAt: new Date() }
        : { failureCount: { increment: 1 }, lastFailureAt: new Date() },
    });
  } catch { /* non-fatal */ }
}

module.exports = { emit, VALID_EVENTS };
