/**
 * Pharmacy Rx-only gate for the checkout path.
 *
 * Off by default (business.enforceRxOnSale = false) — general retail is
 * unaffected. When on, a prescription-only drug cannot be rung up at POS unless
 * the line carries a valid prescription_id: an active, unexpired Rx for the same
 * drug with refills remaining. After the sale commits, the fill is recorded
 * against the Rx (DispenseRecord linked to the sale) and the refill decremented.
 */
const prisma = require('./prisma');
const { logger } = require('./logger');

// Returns { error } to block the sale, or { linked: [{prescriptionId, productId, quantity}] }.
async function check({ businessId, items = [] }) {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { enforceRxOnSale: true } });
  if (!biz?.enforceRxOnSale) return { linked: [] };
  if (!items.length) return { linked: [] };

  const productIds = [...new Set(items.map(i => i.product_id))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, businessId },
    select: { id: true, name: true, isPrescriptionDrug: true },
  });
  const rxOnly = new Map(products.filter(p => p.isPrescriptionDrug).map(p => [p.id, p]));
  if (!rxOnly.size) return { linked: [] };

  const linked = [];
  for (const item of items) {
    const drug = rxOnly.get(item.product_id);
    if (!drug) continue; // OTC line — no gate
    if (!item.prescription_id) {
      return { error: `${drug.name} is prescription-only — a valid prescription is required to dispense it. Capture a prescription and include its id on the line.` };
    }
    const rx = await prisma.prescription.findFirst({
      where: { id: item.prescription_id, businessId, productId: item.product_id },
      select: { id: true, status: true, validUntil: true, refillsAuthorized: true, refillsUsed: true },
    });
    if (!rx) return { error: `No matching prescription found for ${drug.name}.` };
    if (rx.status !== 'active') return { error: `Prescription for ${drug.name} is not active.` };
    if (rx.validUntil && new Date() > new Date(rx.validUntil)) {
      return { error: `Prescription for ${drug.name} has expired.` };
    }
    if (rx.refillsUsed >= 1 + rx.refillsAuthorized) {
      return { error: `No refills remaining on the prescription for ${drug.name}.` };
    }
    linked.push({ prescriptionId: rx.id, productId: item.product_id, quantity: item.quantity, allowed: 1 + rx.refillsAuthorized, used: rx.refillsUsed });
  }
  return { linked };
}

// Records the clinical fill after the sale committed. Stock was already deducted
// by the sale; here we only add the DispenseRecord and decrement the refill.
// Best-effort: a failure here must not unwind a completed sale.
async function recordDispenses({ user, sale, linked }) {
  if (!linked?.length) return;
  try {
    await prisma.$transaction(async (tx) => {
      for (const l of linked) {
        await tx.dispenseRecord.create({
          data: {
            businessId: user.business_id, prescriptionId: l.prescriptionId, productId: l.productId,
            quantity: l.quantity, saleId: sale.id, dispensedById: user.id,
          },
        });
        const newUsed = l.used + 1;
        await tx.prescription.update({
          where: { id: l.prescriptionId },
          data: { refillsUsed: newUsed, status: newUsed >= l.allowed ? 'completed' : 'active' },
        });
      }
    });
  } catch (err) {
    logger.error('rxgate_record_error', { saleId: sale?.id, message: err.message });
  }
}

module.exports = { check, recordDispenses };
