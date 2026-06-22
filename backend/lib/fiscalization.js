/**
 * Fiscalization — tax-authority compliance for formal businesses.
 *
 * Kenya (KRA eTIMS), Tanzania (TRA VFD) and Rwanda (RRA EBM) require every sale
 * to be signed by a registered fiscal device and reported to the authority, with
 * a verifiable receipt (fiscal number + signature + QR). Real fiscal devices sign
 * each receipt over the PREVIOUS one, forming a tamper-evident chain, and sign
 * locally so the till keeps issuing compliant receipts offline — transmitting to
 * the authority when connectivity returns.
 *
 * We model that faithfully: a per-business device with an HMAC signing key and a
 * sequential counter; each receipt's signature covers the canonical invoice data
 * plus the prior signature (genesis-chained). Verification recomputes the HMAC,
 * so a tampered amount or number is detectable. Jurisdiction adapters only shape
 * the label/verification host — the signer and chain are shared.
 *
 * This is a real, offline-capable fiscal model, not a claim to hold a specific
 * government certificate; wiring a live eTIMS/VFD/EBM endpoint is the `transmit`
 * step and a per-jurisdiction credential, layered on top without changing this.
 */
const crypto = require('crypto');
const prisma = require('./prisma');

const JURISDICTIONS = {
  none:  { name: 'Not fiscalized',     prefix: 'NA',  host: null },
  etims: { name: 'Kenya KRA eTIMS',    prefix: 'KRA', host: 'https://itax.kra.go.ke/fiscal/verify' },
  efd:   { name: 'Tanzania TRA VFD',   prefix: 'TRA', host: 'https://verify.tra.go.tz' },
  ebm:   { name: 'Rwanda RRA EBM',     prefix: 'RRA', host: 'https://ebm.rra.gov.rw/verify' },
};

function isSupported(j) { return Object.prototype.hasOwnProperty.call(JURISDICTIONS, j); }

function signingKey(config) {
  return config.deviceKey || process.env.FISCAL_DEVICE_KEY || 'balanzify-fiscal-dev-key';
}

// Canonical, stable string the signature commits to. Order and formatting are
// fixed so verification is reproducible.
function canonical({ jurisdiction, tin, fiscalNumber, dateISO, total, tax, prevSignature }) {
  return [
    jurisdiction, tin || 'NA', fiscalNumber, dateISO,
    Number(total).toFixed(2), Number(tax).toFixed(2), prevSignature || 'GENESIS',
  ].join('|');
}

function sign(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex').slice(0, 32).toUpperCase();
}

/**
 * Sign a sale into a fiscal receipt. Idempotent (one receipt per sale), atomic on
 * the per-business counter, and a no-op when fiscalization is disabled. Returns
 * { skipped } when off, or the receipt. Pass a client if calling inside a tx.
 */
async function fiscalizeSale(saleId, businessId, { client = prisma } = {}) {
  const config = await client.fiscalConfig.findUnique({ where: { businessId } });
  if (!config || !config.enabled || config.jurisdiction === 'none') {
    return { skipped: true, reason: 'fiscalization disabled' };
  }

  const existing = await client.fiscalReceipt.findUnique({ where: { saleId } });
  if (existing) return existing;

  const sale = await client.sale.findFirst({ where: { id: saleId, businessId }, select: { id: true, totalAmount: true, taxAmount: true, createdAt: true } });
  if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });

  const business = await client.business.findUnique({ where: { id: businessId }, select: { taxNumber: true } });
  const jx = JURISDICTIONS[config.jurisdiction] || JURISDICTIONS.none;

  try {
    return await client.$transaction(async (tx) => {
      // Lock the device row so concurrent sales can't take the same fiscal number.
      const rows = await tx.$queryRaw`SELECT last_fiscal_number, last_signature FROM fiscal_config WHERE business_id = ${businessId}::uuid FOR UPDATE`;
      const prevNumber = rows[0]?.last_fiscal_number ?? 0;
      const prevSignature = rows[0]?.last_signature ?? null;
      const fiscalNumber = prevNumber + 1;

      const data = canonical({
        jurisdiction: config.jurisdiction, tin: business?.taxNumber,
        fiscalNumber, dateISO: sale.createdAt.toISOString(),
        total: sale.totalAmount, tax: sale.taxAmount, prevSignature,
      });
      const signature = sign(signingKey(config), data);
      const verificationCode = signature; // unique by construction (chained number)
      const invoiceLabel = `${jx.prefix}-${config.deviceSerial || 'SDC'}-${String(fiscalNumber).padStart(7, '0')}`;
      const qrData = jx.host ? `${jx.host}?code=${verificationCode}` : verificationCode;

      const receipt = await tx.fiscalReceipt.create({
        data: {
          businessId, saleId, jurisdiction: config.jurisdiction, fiscalNumber,
          invoiceLabel, signature, verificationCode, qrData,
          deviceSerial: config.deviceSerial || null, prevSignature, status: 'signed',
        },
      });
      await tx.fiscalConfig.update({ where: { businessId }, data: { lastFiscalNumber: fiscalNumber, lastSignature: signature } });
      return receipt;
    });
  } catch (err) {
    // Lost a race to fiscalize the same sale — return the winner.
    if (err.code === 'P2002') return client.fiscalReceipt.findUnique({ where: { saleId } });
    throw err;
  }
}

/** Recompute the signature to confirm a receipt is authentic and untampered. */
async function verify(verificationCode) {
  const receipt = await prisma.fiscalReceipt.findUnique({
    where: { verificationCode },
    include: { sale: { select: { totalAmount: true, taxAmount: true, createdAt: true, saleNumber: true } }, business: { select: { name: true, taxNumber: true } } },
  });
  if (!receipt) return { valid: false, reason: 'not found' };

  const config = await prisma.fiscalConfig.findUnique({ where: { businessId: receipt.businessId } });
  const data = canonical({
    jurisdiction: receipt.jurisdiction, tin: receipt.business?.taxNumber,
    fiscalNumber: receipt.fiscalNumber, dateISO: receipt.sale.createdAt.toISOString(),
    total: receipt.sale.totalAmount, tax: receipt.sale.taxAmount, prevSignature: receipt.prevSignature,
  });
  const expected = sign(signingKey(config || {}), data);
  const valid = expected === receipt.signature;

  return {
    valid,
    jurisdiction: JURISDICTIONS[receipt.jurisdiction]?.name || receipt.jurisdiction,
    business: receipt.business?.name, tin: receipt.business?.taxNumber || null,
    invoice_label: receipt.invoiceLabel, fiscal_number: receipt.fiscalNumber,
    sale_number: receipt.sale.saleNumber,
    total: parseFloat(receipt.sale.totalAmount), tax: parseFloat(receipt.sale.taxAmount),
    status: receipt.status, signed_at: receipt.createdAt, transmitted_at: receipt.transmittedAt,
  };
}

module.exports = { JURISDICTIONS, isSupported, fiscalizeSale, verify, canonical, sign };
