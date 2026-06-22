/**
 * Payment Routes
 *
 * GET  /api/v1/payments/methods          — list all available payment methods
 * POST /api/v1/payments/verify/:ref      — verify async payment (M-Pesa, Moov ACH)
 * GET  /api/v1/payments/status/:ref      — get payment status
 * POST /api/v1/payments/webhook/mpesa    — M-Pesa STK push callback
 * POST /api/v1/payments/webhook/moov     — Moov transfer event webhook
 */

const express = require('express');
const crypto  = require('crypto');
const { z }   = require('zod'); // 🌟 Make sure to npm install zod if you haven't
const prisma  = require('../lib/prisma');
const registry = require('../lib/payments');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { logger } = require('../lib/logger');
const router = express.Router();

// 🌟 FIX: Define the missing "validate" middleware locally inside this file
const validate = (schema) => (req, res, next) => {
  try {
    // Ensure we are parsing an object (handles raw buffer conversions gracefully)
    const bodyToValidate = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    schema.parse(bodyToValidate);
    next();
  } catch (err) {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
};

// GET /api/v1/payments/methods
router.get('/methods', auth, async (req, res, next) => {
  try {
    const methods = registry.list();
    res.json({ methods });
  } catch (err) { next(err); }
});

// POST /api/v1/payments/verify/:reference
router.post('/verify/:reference', auth, validate(z.object({
  provider: z.string().min(1).max(50),
})), async (req, res, next) => {
  try {
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required in body' });

    const result = await registry.get(provider).verify({ reference: req.params.reference });

    if (result.verified) {
      await prisma.salePayment.updateMany({
        where: { providerReference: req.params.reference, businessId: req.user.business_id },
        data: { status: 'completed', completedAt: new Date() },
      });
    }

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/payments/status/:reference
router.get('/status/:reference', auth, async (req, res, next) => {
  try {
    const { provider } = req.query;
    if (!provider) return res.status(400).json({ error: 'provider query param required' });
    const result = await registry.get(provider).getStatus({ reference: req.params.reference });
    res.json(result);
  } catch (err) { next(err); }
});

// Optional IP allowlist for unauthenticated payment callbacks. M-Pesa does not
// sign its callbacks, so the practical defence is restricting source IPs to the
// provider's published callback ranges (set MPESA_CALLBACK_IPS=ip1,ip2,...).
function ipAllowed(req, envKey) {
  const allow = (process.env[envKey] || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allow.length === 0) return true; // not configured → don't block (logged elsewhere)
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  return allow.includes(ip);
}

// POST /api/v1/payments/webhook/mpesa
router.post('/webhook/mpesa', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!ipAllowed(req, 'MPESA_CALLBACK_IPS')) {
      logger.warn('mpesa_webhook_rejected_ip', { ip: req.ip });
      return res.status(403).json({ ResultCode: 1, ResultDesc: 'Rejected' });
    }

    const rawString = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;
    const body = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;

    const callbackData = body.Body?.stkCallback;
    if (!callbackData) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const reference  = callbackData.CheckoutRequestID;
    const success    = callbackData.ResultCode === 0;
    const mpesaRef   = callbackData.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const paidAmount = callbackData.CallbackMetadata?.Item?.find(i => i.Name === 'Amount')?.Value;

    logger.info('mpesa_webhook_received', { reference, success, mpesaRef, paidAmount });

    // Resolve the exact pending M-Pesa payment this callback refers to, update it,
    // and reconcile the ledger — all in one transaction so the SalePayment, the
    // sale, and the GL move together (and idempotently: the `status: pending`
    // filter means a re-delivered callback finds nothing and changes nothing).
    await prisma.$transaction(async (tx) => {
      const payment = await tx.salePayment.findFirst({
        where: { providerReference: reference, provider: 'mpesa', status: 'pending' },
        select: { id: true, saleId: true, amount: true, businessId: true },
      });
      if (!payment) return; // unknown / already-processed — accept, change nothing.

      await tx.salePayment.update({
        where: { id: payment.id },
        data: {
          status:            success ? 'completed' : 'failed',
          providerReference: mpesaRef || reference,
          completedAt:       success ? new Date() : null,
          rawResponse:       body,
        },
      });

      const amt = parseFloat(payment.amount);
      if (success) {
        // Money arrived: move it from in-transit clearing to real mobile money, and
        // finalise the sale.
        if (payment.saleId) {
          const sale = await tx.sale.findUnique({ where: { id: payment.saleId }, select: { status: true } });
          if (sale?.status === 'pending') await tx.sale.update({ where: { id: payment.saleId }, data: { status: 'completed' } });
        }
        if (amt > 0) {
          await accounting.postJournal(tx, {
            businessId: payment.businessId, description: `M-Pesa settled — ${mpesaRef || reference}`,
            sourceType: 'mpesa_settlement', sourceId: payment.id,
            lines: [
              { code: '1010', debit: amt, credit: 0, description: 'Mobile money received' },
              { code: '1015', debit: 0, credit: amt, description: 'In-transit cleared' },
            ],
          });
        }
      } else if (amt > 0) {
        // Payment failed: the money never arrived, so the in-transit amount becomes a
        // receivable — the customer still owes it. The sale stays pending (unpaid).
        await accounting.postJournal(tx, {
          businessId: payment.businessId, description: `M-Pesa failed — ${reference}`,
          sourceType: 'mpesa_failed', sourceId: payment.id,
          lines: [
            { code: '1100', debit: amt, credit: 0, description: 'Receivable (failed M-Pesa)' },
            { code: '1015', debit: 0, credit: amt, description: 'In-transit cleared' },
          ],
        });
      }
    });

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    logger.error('mpesa_webhook_error', { message: err.message });
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

// POST /api/v1/payments/webhook/moov
router.post('/webhook/moov', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Fail CLOSED: without a configured secret we cannot verify authenticity,
    // so reject rather than silently trusting any caller.
    if (!process.env.MOOV_WEBHOOK_SECRET) {
      logger.error('moov_webhook_no_secret_configured');
      return res.status(503).json({ error: 'Webhook verification not configured' });
    }
    const signature = req.headers['x-moov-signature'];
    if (!signature) {
      logger.warn('moov_webhook_missing_signature');
      return res.status(401).json({ error: 'Missing signature' });
    }
    const expected = crypto
      .createHmac('sha256', process.env.MOOV_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');
    if (signature !== `sha256=${expected}`) {
      logger.warn('moov_webhook_invalid_signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const rawString = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;
    const event = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;

    logger.info('moov_webhook_received', { type: event.eventType, transferID: event.data?.transferID });

    if (['transfer.completed', 'transfer.failed'].includes(event.eventType)) {
      const success = event.eventType === 'transfer.completed';
      // Scope to a pending Moov payment for this transfer; update by id.
      const payment = await prisma.salePayment.findFirst({
        where: { providerReference: event.data.transferID, provider: 'moov', status: 'pending' },
        select: { id: true },
      });
      if (payment) {
        await prisma.salePayment.update({
          where: { id: payment.id },
          data: {
            status:      success ? 'completed' : 'failed',
            completedAt: success ? new Date() : null,
            rawResponse: event,
          },
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('moov_webhook_error', { message: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;