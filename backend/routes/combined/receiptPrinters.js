const express = require('express');
const prisma = require('../../lib/prisma');
const { auth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { ReceiptPrinterSchema } = require('../../validation/schemas');

// ── Receipt printers ─────────────────────────────────────────────────────────
// charactersPerLine drives the ESC/POS receipt layout. At most one printer per
// business is the default; the invariant is kept inside the write transaction.
const receiptPrintersRouter = express.Router();

const toBody = (b) => ({
  name: b.name,
  connectionType: b.connection_type,
  capabilityProfile: b.capability_profile,
  charactersPerLine: b.characters_per_line,
  // Only a network printer has an address — never keep stale values from before
  // the connection type was switched.
  ipAddress: b.connection_type === 'network' ? b.ip_address : null,
  port: b.connection_type === 'network' ? b.port : null,
  isDefault: !!b.is_default,
});

/** The printer whose layout a receipt should use: the explicit one, else the default. */
async function resolvePrinter(businessId, printerId) {
  if (printerId) {
    const p = await prisma.receiptPrinter.findUnique({ where: { id: printerId } });
    if (p && p.businessId === businessId) return p;
    return null;
  }
  return prisma.receiptPrinter.findFirst({ where: { businessId, isDefault: true } });
}

receiptPrintersRouter.get('/', auth, async (req, res, next) => {
  try {
    const printers = await prisma.receiptPrinter.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json({ printers });
  } catch (err) { next(err); }
});

receiptPrintersRouter.post('/', auth, requireRole('owner', 'manager'), validate(ReceiptPrinterSchema), async (req, res, next) => {
  try {
    const data = toBody(req.body);
    const created = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.receiptPrinter.updateMany({ where: { businessId: req.user.business_id, isDefault: true }, data: { isDefault: false } });
      }
      return tx.receiptPrinter.create({ data: { ...data, businessId: req.user.business_id, createdById: req.user.id } });
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

receiptPrintersRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(ReceiptPrinterSchema), async (req, res, next) => {
  try {
    const existing = await prisma.receiptPrinter.findUnique({ where: { id: req.params.id }, select: { businessId: true } });
    if (!existing || existing.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });

    const data = toBody(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.receiptPrinter.updateMany({ where: { businessId: req.user.business_id, isDefault: true, id: { not: req.params.id } }, data: { isDefault: false } });
      }
      return tx.receiptPrinter.update({ where: { id: req.params.id }, data });
    });
    res.json(updated);
  } catch (err) { next(err); }
});

receiptPrintersRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.receiptPrinter.findUnique({ where: { id: req.params.id }, select: { businessId: true } });
    if (!existing || existing.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    await prisma.receiptPrinter.delete({ where: { id: req.params.id } });
    res.json({ message: 'Printer deleted.' });
  } catch (err) { next(err); }
});

module.exports = { receiptPrintersRouter, resolvePrinter };
