/**
 * Delivery Routes — the opt-in consumer-ordering + driver-dispatch layer.
 *
 * The unfair advantage: the merchants and their catalogs are already on the
 * platform, so this is an EXTENSION of supply we already have, not a cold-start
 * marketplace. Intake is channel-agnostic (a WhatsApp message, the web, or rung
 * up at the POS); dispatch auto-matches an available driver; and the delivery fee
 * flows into the same general ledger as everything else — cash-on-delivery lands
 * with the driver as a receivable, a natural hook for driver float/advances.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const accounting = require('../lib/accounting');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

const serializeDriver = (d) => ({
  id: d.id, name: d.name, phone: d.phone, vehicle_type: d.vehicleType,
  status: d.status, is_active: d.isActive,
});
const serializeDelivery = (d) => ({
  id: d.id, sale_id: d.saleId, driver_id: d.driverId,
  driver_name: d.driver?.name || null,
  customer_name: d.customerName, customer_phone: d.customerPhone, address: d.address,
  channel: d.channel, items_summary: d.itemsSummary,
  order_amount: parseFloat(d.orderAmount), delivery_fee: parseFloat(d.deliveryFee),
  payment_mode: d.paymentMode, status: d.status,
  assigned_at: d.assignedAt, delivered_at: d.deliveredAt, created_at: d.createdAt,
});

// ── Drivers ─────────────────────────────────────────────────────────
router.post('/drivers', auth, requireRole('owner', 'manager'), validate(z.object({
  name: z.string().trim().min(1).max(255),
  phone: z.string().max(50).optional().nullable(),
  vehicle_type: z.enum(['motorbike', 'car', 'bicycle', 'foot']).optional(),
})), async (req, res, next) => {
  try {
    const d = await prisma.driver.create({
      data: { businessId: req.user.business_id, name: req.body.name, phone: req.body.phone || null, vehicleType: req.body.vehicle_type || null, status: 'offline' },
    });
    res.status(201).json(serializeDriver(d));
  } catch (err) { next(err); }
});

router.get('/drivers', auth, async (req, res, next) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: { businessId: req.user.business_id, isActive: true, ...(req.query.status && { status: String(req.query.status) }) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ drivers: drivers.map(serializeDriver) });
  } catch (err) { next(err); }
});

router.put('/drivers/:id/status', auth, validate(z.object({
  status: z.enum(['available', 'busy', 'offline']),
})), async (req, res, next) => {
  try {
    const d = await prisma.driver.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!d) return res.status(404).json({ title: 'Driver not found', status: 404 });
    const updated = await prisma.driver.update({ where: { id: d.id }, data: { status: req.body.status } });
    res.json(serializeDriver(updated));
  } catch (err) { next(err); }
});

// ── Deliveries ──────────────────────────────────────────────────────
router.post('/', auth, validate(z.object({
  customer_name: z.string().trim().min(1).max(255),
  customer_phone: z.string().max(50).optional().nullable(),
  address: z.string().trim().min(1),
  channel: z.enum(['whatsapp', 'web', 'pos']).default('pos'),
  items_summary: z.string().max(2000).optional().nullable(),
  order_amount: z.coerce.number().nonnegative().default(0),
  delivery_fee: z.coerce.number().nonnegative().default(0),
  payment_mode: z.enum(['cod', 'prepaid']).default('cod'),
  sale_id: z.string().uuid().optional().nullable(),
  auto_assign: z.boolean().default(true),
})), async (req, res, next) => {
  try {
    const b = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          businessId: req.user.business_id, saleId: b.sale_id || null,
          customerName: b.customer_name, customerPhone: b.customer_phone || null, address: b.address,
          channel: b.channel, itemsSummary: b.items_summary || null,
          orderAmount: b.order_amount, deliveryFee: b.delivery_fee, paymentMode: b.payment_mode,
        },
      });
      // Auto-match: assign the longest-idle available driver (round-robin-ish).
      if (b.auto_assign) {
        const driver = await tx.driver.findFirst({
          where: { businessId: req.user.business_id, isActive: true, status: 'available' },
          orderBy: { createdAt: 'asc' },
        });
        if (driver) {
          await tx.driver.update({ where: { id: driver.id }, data: { status: 'busy' } });
          return tx.delivery.update({ where: { id: delivery.id }, data: { driverId: driver.id, status: 'assigned', assignedAt: new Date() }, include: { driver: true } });
        }
      }
      return tx.delivery.findUnique({ where: { id: delivery.id }, include: { driver: true } });
    });
    res.status(201).json(serializeDelivery(result));
  } catch (err) { next(err); }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const rows = await prisma.delivery.findMany({
      where: { businessId: req.user.business_id, ...(req.query.status && { status: String(req.query.status) }) },
      include: { driver: true }, orderBy: { createdAt: 'desc' }, take: 200,
    });
    res.json({ deliveries: rows.map(serializeDelivery) });
  } catch (err) { next(err); }
});

// Assign (or reassign) a specific driver, or auto-match if none given.
router.post('/:id/assign', auth, requireRole('owner', 'manager'), validate(z.object({
  driver_id: z.string().uuid().optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findFirst({ where: { id: req.params.id, businessId } });
      if (!delivery) return { code: 404, error: 'Delivery not found' };
      if (delivery.status === 'delivered' || delivery.status === 'cancelled') return { code: 422, error: 'Delivery already closed' };

      let driver;
      if (req.body.driver_id) {
        driver = await tx.driver.findFirst({ where: { id: req.body.driver_id, businessId, isActive: true } });
        if (!driver) return { code: 404, error: 'Driver not found' };
      } else {
        driver = await tx.driver.findFirst({ where: { businessId, isActive: true, status: 'available' }, orderBy: { createdAt: 'asc' } });
        if (!driver) return { code: 409, error: 'No available driver to assign' };
      }
      await tx.driver.update({ where: { id: driver.id }, data: { status: 'busy' } });
      const updated = await tx.delivery.update({ where: { id: delivery.id }, data: { driverId: driver.id, status: 'assigned', assignedAt: new Date() }, include: { driver: true } });
      return { delivery: updated };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.json(serializeDelivery(out.delivery));
  } catch (err) { next(err); }
});

// Advance status: assigned → picked_up → delivered (or cancelled). Completing a
// delivery posts the fee to the ledger and frees the driver.
router.put('/:id/status', auth, validate(z.object({
  status: z.enum(['picked_up', 'delivered', 'cancelled']),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const out = await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findFirst({ where: { id: req.params.id, businessId } });
      if (!delivery) return { code: 404, error: 'Delivery not found' };
      if (delivery.status === 'delivered' || delivery.status === 'cancelled') return { code: 422, error: 'Delivery already closed' };

      const stamps = {};
      if (req.body.status === 'delivered') {
        stamps.deliveredAt = new Date();
        const fee = parseFloat(delivery.deliveryFee);
        if (fee > 0) {
          await accounting.postDeliveryRevenue(tx, {
            businessId, fee, method: 'cash', cod: delivery.paymentMode === 'cod',
            sourceId: delivery.id, createdById: req.user.id,
          });
        }
      }
      // Free the driver when the job closes.
      if ((req.body.status === 'delivered' || req.body.status === 'cancelled') && delivery.driverId) {
        await tx.driver.update({ where: { id: delivery.driverId }, data: { status: 'available' } });
      }
      const updated = await tx.delivery.update({ where: { id: delivery.id }, data: { status: req.body.status, ...stamps }, include: { driver: true } });
      return { delivery: updated };
    });
    if (out.error) return res.status(out.code).json({ title: out.error, status: out.code });
    res.json(serializeDelivery(out.delivery));
  } catch (err) { next(err); }
});

module.exports = router;
