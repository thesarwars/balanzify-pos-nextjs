/**
 * Fiscalization Routes.
 *
 *   POST /api/v1/fiscal/config                 — register the fiscal device
 *   GET  /api/v1/fiscal/config                 — current device config
 *   POST /api/v1/fiscal/sales/:saleId/fiscalize— sign a sale (idempotent)
 *   GET  /api/v1/fiscal/receipt/:saleId        — a sale's fiscal receipt
 *   POST /api/v1/fiscal/sales/:saleId/transmit — mark transmitted to the authority
 *   GET  /api/v1/fiscal/pending                — signed-but-not-transmitted queue
 *   GET  /fiscal/verify/:code                  — PUBLIC authenticity check (no auth)
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const crypto = require('crypto');
const fiscal = require('../lib/fiscalization');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

function serialize(r) {
  return {
    sale_id: r.saleId, jurisdiction: r.jurisdiction, fiscal_number: r.fiscalNumber,
    invoice_label: r.invoiceLabel, signature: r.signature, verification_code: r.verificationCode,
    qr_data: r.qrData, device_serial: r.deviceSerial, status: r.status,
    transmitted_at: r.transmittedAt, signed_at: r.createdAt,
  };
}

router.get('/config', auth, async (req, res, next) => {
  try {
    const c = await prisma.fiscalConfig.findUnique({ where: { businessId: req.user.business_id } });
    if (!c) return res.json({ enabled: false, jurisdiction: 'none' });
    res.json({
      enabled: c.enabled, jurisdiction: c.jurisdiction,
      jurisdiction_name: fiscal.JURISDICTIONS[c.jurisdiction]?.name || c.jurisdiction,
      device_serial: c.deviceSerial, last_fiscal_number: c.lastFiscalNumber,
    });
  } catch (err) { next(err); }
});

router.post('/config', auth, requireRole('owner'), validate(z.object({
  jurisdiction: z.enum(['none', 'etims', 'efd', 'ebm']),
  device_serial: z.string().max(64).optional(),
  enabled: z.coerce.boolean().optional(),
})), async (req, res, next) => {
  try {
    const businessId = req.user.business_id;
    const { jurisdiction, device_serial } = req.body;
    const enabled = req.body.enabled ?? (jurisdiction !== 'none');
    const existing = await prisma.fiscalConfig.findUnique({ where: { businessId } });
    // Mint a device signing key once; never rotate it silently (it anchors the chain).
    const deviceKey = existing?.deviceKey || crypto.randomBytes(24).toString('hex');
    const c = await prisma.fiscalConfig.upsert({
      where: { businessId },
      update: { jurisdiction, deviceSerial: device_serial ?? existing?.deviceSerial, enabled },
      create: { businessId, jurisdiction, deviceSerial: device_serial || null, enabled, deviceKey },
    });
    res.status(201).json({ enabled: c.enabled, jurisdiction: c.jurisdiction, device_serial: c.deviceSerial });
  } catch (err) { next(err); }
});

router.post('/sales/:saleId/fiscalize', auth, async (req, res, next) => {
  try {
    const sale = await prisma.sale.findFirst({ where: { id: req.params.saleId, businessId: req.user.business_id }, select: { id: true } });
    if (!sale) return res.status(404).json({ title: 'Sale not found', status: 404 });
    const r = await fiscal.fiscalizeSale(sale.id, req.user.business_id);
    if (r.skipped) return res.status(409).json({ title: 'Fiscalization is not enabled for this business', status: 409, reason: r.reason });
    res.status(201).json(serialize(r));
  } catch (err) { next(err); }
});

router.get('/receipt/:saleId', auth, async (req, res, next) => {
  try {
    const r = await prisma.fiscalReceipt.findFirst({ where: { saleId: req.params.saleId, businessId: req.user.business_id } });
    if (!r) return res.status(404).json({ title: 'No fiscal receipt for this sale', status: 404 });
    res.json(serialize(r));
  } catch (err) { next(err); }
});

router.post('/sales/:saleId/transmit', auth, async (req, res, next) => {
  try {
    const r = await prisma.fiscalReceipt.findFirst({ where: { saleId: req.params.saleId, businessId: req.user.business_id } });
    if (!r) return res.status(404).json({ title: 'No fiscal receipt for this sale', status: 404 });
    if (r.status === 'transmitted') return res.json(serialize(r));
    // The real authority POST goes here; offline, this stays queued until online.
    const updated = await prisma.fiscalReceipt.update({ where: { id: r.id }, data: { status: 'transmitted', transmittedAt: new Date() } });
    res.json(serialize(updated));
  } catch (err) { next(err); }
});

router.get('/pending', auth, async (req, res, next) => {
  try {
    const rows = await prisma.fiscalReceipt.findMany({
      where: { businessId: req.user.business_id, status: 'signed' },
      orderBy: { createdAt: 'asc' }, take: 500,
    });
    res.json({ pending: rows.length, receipts: rows.map(serialize) });
  } catch (err) { next(err); }
});

// Public verification — what a customer/auditor hits from the receipt QR. No auth.
const publicRouter = express.Router();
publicRouter.get('/verify/:code', async (req, res, next) => {
  try {
    const result = await fiscal.verify(req.params.code);
    res.status(result.valid ? 200 : 404).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
