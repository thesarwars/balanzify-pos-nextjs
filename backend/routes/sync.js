/**
 * Sync Routes — the offline-first spine.
 *
 * African retail runs on intermittent connectivity, so the till must keep selling
 * with the network down and reconcile when it returns. Two endpoints:
 *
 *   POST /sync/push  — replay a device's offline outbox of operations. Each sale
 *                      carries a CLIENT-generated idempotency key (the device can't
 *                      call /sales/initiate while offline), so we mint the matching
 *                      sale_keys row and replay through the very same createSale
 *                      service the online till uses. That gives us exactly-once
 *                      semantics and cart-conflict detection for free: a re-pushed
 *                      op returns the original sale ("duplicate"), a key reused with
 *                      a different cart is rejected ("conflict"). One bad op never
 *                      fails the batch — every op gets its own result.
 *
 *   GET  /sync/pull  — bootstrap / delta. Hands the device everything it needs to
 *                      sell offline (catalog + stock, customers, locations), filtered
 *                      to what changed since the device's last cursor. Returns a
 *                      server_time the device stores as its next `since`.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createSale } = require('./sales');

const router = express.Router();

// Offline outbox replay. Operations are processed in order; results are positional
// so the device can mark each queued op synced/duplicate/conflict/error.
const PushSchema = z.object({
  device_id: z.string().min(1).max(128),
  operations: z.array(z.object({
    op_id: z.string().min(1).max(128),
    type: z.literal('sale'),
    idempotency_key: z.string().min(1).max(128),
    payload: z.record(z.any()),
    client_ts: z.string().optional(),
  })).min(1).max(200),
});

router.post('/push', auth, validate(PushSchema), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const { device_id, operations } = req.body;
    const results = [];
    let applied = 0;

    for (const op of operations) {
      try {
        // Mint the sale_keys row for this client-generated key so createSale will
        // accept it. A long expiry tolerates an outbox that sat offline for days;
        // upsert leaves an already-synced key untouched so the replay hits the
        // idempotent "used" path instead of double-selling.
        await prisma.saleKey.upsert({
          where: { key: op.idempotency_key },
          update: {},
          create: {
            key: op.idempotency_key,
            cashierId: req.user.id,
            businessId,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        const sale = await createSale({ user: req.user, body: { ...op.payload, idempotency_key: op.idempotency_key, idempotency_nonce: op.op_id } });
        if (!sale._retry) applied += 1;
        results.push({
          op_id: op.op_id,
          status: sale._retry ? 'duplicate' : 'applied',
          sale_id: sale.id,
          sale_number: sale.saleNumber ?? sale.sale_number ?? null,
        });
      } catch (err) {
        const conflict = err.statusCode === 409;
        const reason = conflict ? 'conflict' : (err.statusCode ? 'rejected' : 'error');
        // An offline sale that fails replay already happened at the till — never lose
        // it silently. Park it in the dead-letter for manual reconciliation. Keyed by
        // (business, device, op) so a re-flush of the same failing op updates in place.
        try {
          await prisma.unsyncedSale.upsert({
            where: { businessId_deviceId_opId: { businessId, deviceId: device_id, opId: op.op_id } },
            update: { reason, errorMessage: err.message, payload: op.payload, idempotencyKey: op.idempotency_key, resolved: false },
            create: {
              businessId, deviceId: device_id, opId: op.op_id, idempotencyKey: op.idempotency_key,
              reason, errorMessage: err.message, payload: op.payload, createdById: req.user.id,
            },
          });
        } catch { /* dead-letter is best-effort; never fail the batch over it */ }
        results.push({
          op_id: op.op_id,
          status: conflict ? 'conflict' : 'error',
          code: conflict ? 'CART_CONFLICT' : (err.statusCode ? 'REJECTED' : 'ERROR'),
          error: err.message,
          dead_lettered: true,
        });
      }
    }

    // Advance the device cursor (best-effort — never fail the push over telemetry).
    try {
      await prisma.syncDevice.upsert({
        where: { businessId_deviceId: { businessId, deviceId: device_id } },
        update: { lastPushAt: new Date(), pushedOps: { increment: applied }, userId: req.user.id },
        create: { businessId, deviceId: device_id, userId: req.user.id, lastPushAt: new Date(), pushedOps: applied },
      });
    } catch { /* ignore */ }

    res.json({
      server_time: new Date().toISOString(),
      applied,
      total: operations.length,
      results,
    });
  } catch (err) { next(err); }
});

// Compact serializers — only what a till needs to sell offline.
function packProduct(p) {
  return {
    id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
    selling_price: parseFloat(p.sellingPrice), cost_price: parseFloat(p.costPrice),
    wholesale_price: parseFloat(p.wholesalePrice),
    unit_of_measure: p.unitOfMeasure, tax_rate_id: p.taxRateId || null,
    is_active: p.isActive, updated_at: p.updatedAt,
    stock: (p.stockLevels || []).map(s => ({ location_id: s.locationId, quantity: s.quantity })),
  };
}
function packCustomer(c) {
  return {
    id: c.id, name: c.name, phone: c.phone || null, email: c.email || null,
    credit_limit: parseFloat(c.creditLimit), outstanding_balance: parseFloat(c.outstandingBalance),
    loyalty_points: c.loyaltyPoints, is_active: c.isActive, updated_at: c.updatedAt,
  };
}

router.get('/pull', auth, async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const since = req.query.since ? new Date(req.query.since) : null;
    if (since && isNaN(since.getTime())) {
      return res.status(400).json({ title: 'Invalid `since` timestamp', status: 400 });
    }
    // Snapshot the cursor BEFORE reading so nothing committed during the read is
    // missed on the next delta (a small overlap is harmless — pulls are idempotent).
    const serverTime = new Date();
    const delta = since ? { updatedAt: { gt: since } } : {};

    const [products, customers, locations] = await Promise.all([
      prisma.product.findMany({ where: { businessId, ...delta }, include: { stockLevels: true }, orderBy: { updatedAt: 'asc' }, take: 2000 }),
      prisma.customer.findMany({ where: { businessId, ...delta }, orderBy: { updatedAt: 'asc' }, take: 2000 }),
      prisma.location.findMany({ where: { businessId, isActive: true }, select: { id: true, name: true, address: true } }),
    ]);

    if (req.query.device_id) {
      try {
        await prisma.syncDevice.upsert({
          where: { businessId_deviceId: { businessId, deviceId: String(req.query.device_id) } },
          update: { lastPullAt: serverTime, userId: req.user.id },
          create: { businessId, deviceId: String(req.query.device_id), userId: req.user.id, lastPullAt: serverTime },
        });
      } catch { /* ignore */ }
    }

    res.json({
      server_time: serverTime.toISOString(),
      since: since ? since.toISOString() : null,
      full_snapshot: !since,
      counts: { products: products.length, customers: customers.length, locations: locations.length },
      products: products.map(packProduct),
      customers: customers.map(packCustomer),
      locations,
    });
  } catch (err) { next(err); }
});

// A till's view of its own sync health.
router.get('/devices', auth, async (req, res, next) => {
  try {
    const devices = await prisma.syncDevice.findMany({
      where: { businessId: req.user.business_id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ devices: devices.map(d => ({
      device_id: d.deviceId, label: d.label, user_id: d.userId,
      last_push_at: d.lastPushAt, last_pull_at: d.lastPullAt, pushed_ops: d.pushedOps,
    })) });
  } catch (err) { next(err); }
});

// Dead-letter queue — offline sales that couldn't be replayed and need a human.
// This is the safety net for "a sale happened at the till but the server rejected
// the replay": it must be visible, not lost. Defaults to the unresolved backlog.
router.get('/unsynced', auth, async (req, res, next) => {
  try {
    const resolved = req.query.resolved === 'true';
    const rows = await prisma.unsyncedSale.findMany({
      where: { businessId: req.user.business_id, resolved },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ unsynced: rows.map(r => ({
      id: r.id, device_id: r.deviceId, op_id: r.opId, idempotency_key: r.idempotencyKey,
      reason: r.reason, error: r.errorMessage, payload: r.payload,
      resolved: r.resolved, resolution: r.resolution, resolved_at: r.resolvedAt,
      created_at: r.createdAt,
    })) });
  } catch (err) { next(err); }
});

// Mark a parked sale reconciled — the operator has re-rung it, adjusted stock, or
// voided it on the till. We only record the disposition; we don't auto-post, because
// the correct fix (re-key vs adjust vs void) is a human judgement at the counter.
const ResolveSchema = z.object({
  resolution: z.enum(['re_synced', 'voided', 'adjusted']),
});
router.post('/unsynced/:id/resolve', auth, validate(ResolveSchema), async (req, res, next) => {
  try {
    const existing = await prisma.unsyncedSale.findFirst({
      where: { id: req.params.id, businessId: req.user.business_id },
    });
    if (!existing) return res.status(404).json({ title: 'Unsynced sale not found', status: 404 });
    const row = await prisma.unsyncedSale.update({
      where: { id: existing.id },
      data: { resolved: true, resolvedAt: new Date(), resolvedById: req.user.id, resolution: req.body.resolution },
    });
    res.json({ id: row.id, resolved: row.resolved, resolution: row.resolution, resolved_at: row.resolvedAt });
  } catch (err) { next(err); }
});

module.exports = router;
