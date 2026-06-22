/**
 * Checkout Experience Routes
 *
 * Everything that happens at and immediately after payment:
 *
 * QR Payments:
 *   POST /api/v1/checkout/qr              — generate payment QR for any provider
 *   GET  /api/v1/checkout/qr/:saleId/status — poll payment status (async providers)
 *
 * Thermal Printing:
 *   GET  /api/v1/checkout/receipt/:saleId/escpos — raw ESC/POS bytes for thermal printer
 *   GET  /api/v1/checkout/receipt/:saleId/pdf    — PDF receipt (for email/folio)
 *
 * Digital Receipt:
 *   GET  /api/v1/r/:token                 — public digital receipt page (no auth)
 *   POST /api/v1/checkout/receipt/:saleId/send-whatsapp — send receipt via WhatsApp
 *   POST /api/v1/checkout/receipt/:saleId/send-email    — send receipt via email
 *
 * Customer Display:
 *   GET  /api/v1/checkout/display/:businessId    — public cart display (no auth)
 *   POST /api/v1/checkout/display/:businessId    — update display (cashier pushes state)
 */

const express = require('express');
const { z }   = require('zod');
const prisma  = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { generatePaymentQR } = require('../lib/qrpayment');
const { generateEscPos, generateWhatsAppReceipt, generateReceiptToken, receiptUrl } = require('../lib/receipt');
const wa = require('../lib/whatsapp');
const { logger } = require('../lib/logger');
const { escapeHtml } = require('../lib/html');
const registry = require('../lib/payments');
const router = express.Router();

// In-memory customer display state per business (resets on server restart — intentional)
// For multi-server: move to Redis. For single server: memory is fine.
const displayState = new Map();

// ── HELPERS ───────────────────────────────────────────────────────

async function getSaleWithItems(saleId, businessId) {
  return prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      items: {
        include: { product: { select: { name: true } } },
      },
      customer: { select: { name: true, phone: true, whatsapp: true } },
      cashier:  { select: { name: true } },
    },
  });
}

async function getOrCreateReceiptToken(saleId) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { receiptToken: true } });
  if (sale?.receiptToken) return sale.receiptToken;
  const token = generateReceiptToken();
  await prisma.sale.update({ where: { id: saleId }, data: { receiptToken: token } });
  return token;
}

// ── QR PAYMENT ────────────────────────────────────────────────────

// POST /api/v1/checkout/qr
// Generate a payment QR code for display in the POS
router.post('/qr', auth, validate(z.object({
  provider:   z.string().min(1).max(50),
  amount:     z.coerce.number().positive(),
  currency:   z.string().length(3).default('USD'),
  reference:  z.string().max(50).optional(),
  sale_id:    z.string().uuid().optional(),
})), async (req, res, next) => {
  try {
    const { provider, amount, currency, reference, sale_id } = req.body;

    // Validate provider is registered
    if (!registry.has(provider) && !['mpesa','zaad','evc','evcplus'].includes(provider)) {
      return res.status(400).json({ error: `Unknown payment provider: ${provider}` });
    }

    // Get business name for QR display
    const business = await prisma.business.findUnique({
      where: { id: req.user.business_id },
      select: { name: true },
    });

    const result = await generatePaymentQR({
      provider,
      amount,
      currency,
      reference:    reference || sale_id || `BAL-${Date.now()}`,
      merchantName: business?.name || 'Balanzify Merchant',
    });

    // If sale_id provided, link QR to sale for status polling
    if (sale_id) {
      await prisma.salePayment.updateMany({
        where: { saleId: sale_id, provider, status: 'pending' },
        data:  { providerReference: result.payload?.slice(0, 255) || null },
      });
    }

    res.json({
      ...result,
      // Strip full payload from response — client only needs the image
      payload: undefined,
      qr_data_url: result.qrDataUrl,
      instructions: result.instructions || `Pay ${currency} ${parseFloat(amount).toFixed(2)} via ${provider.toUpperCase()}`,
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    next(err);
  }
});

// GET /api/v1/checkout/qr/:saleId/status
// Poll payment status — call every 3 seconds until confirmed
router.get('/qr/:saleId/status', auth, async (req, res, next) => {
  try {
    const payments = await prisma.salePayment.findMany({
      where: { saleId: req.params.saleId, businessId: req.user.business_id },
      orderBy: { createdAt: 'desc' },
    });

    const pending   = payments.filter(p => p.status === 'pending');
    const completed = payments.filter(p => p.status === 'completed');
    const failed    = payments.filter(p => p.status === 'failed');

    // Check live status from provider for any pending payments
    for (const payment of pending) {
      if (registry.has(payment.provider) && payment.providerReference) {
        try {
          const liveStatus = await registry.get(payment.provider).getStatus({
            reference: payment.providerReference,
          });
          if (liveStatus.status === 'completed') {
            await prisma.salePayment.update({
              where: { id: payment.id },
              data:  { status: 'completed', completedAt: new Date() },
            });
            completed.push({ ...payment, status: 'completed' });
            pending.splice(pending.indexOf(payment), 1);
          }
        } catch { /* provider check failed — not critical */ }
      }
    }

    const allComplete = payments.length > 0 && pending.length === 0 && failed.length === 0;

    res.json({
      sale_id:    req.params.saleId,
      status:     allComplete ? 'completed' : pending.length > 0 ? 'pending' : 'failed',
      confirmed:  allComplete,
      payments:   payments.map(p => ({ provider: p.provider, status: p.status, amount: p.amount })),
    });
  } catch (err) { next(err); }
});

// ── THERMAL RECEIPT (ESC/POS) ─────────────────────────────────────

// GET /api/v1/checkout/receipt/:saleId/escpos
// Returns raw ESC/POS bytes — send directly to thermal printer via BT/USB
router.get('/receipt/:saleId/escpos', auth, async (req, res, next) => {
  try {
    const sale = await getSaleWithItems(req.params.saleId, req.user.business_id);
    if (!sale) return res.status(404).json({ title: 'Sale not found', status: 404 });

    const business = await prisma.business.findUnique({ where: { id: req.user.business_id } });

    // Generate or retrieve receipt token for digital receipt link
    const token = await getOrCreateReceiptToken(sale.id);
    const url   = receiptUrl(token);

    const items = sale.items.map(i => ({
      productName: i.product?.name || 'Item',
      quantity:    i.quantity,
      unitPrice:   i.unitPrice,
      totalPrice:  i.totalPrice,
      notes:       i.notes,
    }));

    const bytes = await generateEscPos({ sale, items, business, receiptUrl: url });

    // Return as binary — frontend sends directly to printer via Web Bluetooth or USB
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="receipt-${sale.saleNumber}.bin"`);
    res.set('X-Receipt-Token', token);
    res.set('X-Receipt-Url', url);
    res.send(bytes);
  } catch (err) { next(err); }
});

// GET /api/v1/checkout/receipt/:saleId/pdf
// Full PDF receipt — for email attachments, hotel folios, expense claims
router.get('/receipt/:saleId/pdf', auth, async (req, res, next) => {
  try {
    const sale = await getSaleWithItems(req.params.saleId, req.user.business_id);
    if (!sale) return res.status(404).json({ title: 'Sale not found', status: 404 });

    const business = await prisma.business.findUnique({ where: { id: req.user.business_id } });
    const token    = await getOrCreateReceiptToken(sale.id);
    const url      = receiptUrl(token);

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: [226, 500], margin: 10 }); // 80mm width

    const buffers = [];
    doc.on('data', b => buffers.push(b));
    doc.on('end', () => {
      const pdf = Buffer.concat(buffers);
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="receipt-${sale.saleNumber}.pdf"`);
      res.send(pdf);
    });

    const currency = sale.currency || business?.currency || 'USD';
    const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;

    // Header
    doc.fontSize(14).font('Helvetica-Bold').text(business?.name || 'Balanzify', { align: 'center' });
    if (business?.address) doc.fontSize(8).font('Helvetica').text(business.address, { align: 'center' });
    if (business?.phone)   doc.text(business.phone, { align: 'center' });
    if (business?.taxNumber) doc.text(`TIN: ${business.taxNumber}`, { align: 'center' });
    if (business?.receiptHeader) {
      doc.moveDown(0.3).fontSize(8).text(business.receiptHeader, { align: 'center' });
    }

    doc.moveDown(0.5).moveTo(10, doc.y).lineTo(216, doc.y).stroke();

    // Sale info
    const saleDate = new Date(sale.createdAt);
    doc.moveDown(0.3).fontSize(8).font('Helvetica');
    doc.text(`Order: ${sale.saleNumber}`);
    doc.text(`Date: ${saleDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
    if (sale.cashier?.name) doc.text(`Cashier: ${sale.cashier.name}`);

    doc.moveDown(0.3).moveTo(10, doc.y).lineTo(216, doc.y).stroke().moveDown(0.3);

    // Items
    for (const item of sale.items) {
      const name  = item.product?.name || 'Item';
      const qty   = item.quantity;
      const total = parseFloat(item.totalPrice || 0);
      doc.fontSize(8).font('Helvetica').text(`${qty}x ${name}`);
      doc.fontSize(8).text(`  ${fmt(parseFloat(item.unitPrice))} each`, { continued: true });
      doc.text(`${fmt(total)}`, { align: 'right' });
      if (item.notes) doc.fontSize(7).text(`  * ${item.notes}`);
    }

    doc.moveDown(0.3).moveTo(10, doc.y).lineTo(216, doc.y).stroke().moveDown(0.3);

    // Totals
    const discount = parseFloat(sale.discountAmount || 0);
    const tax      = parseFloat(sale.taxAmount || 0);
    const total    = parseFloat(sale.totalAmount || 0);

    if (discount > 0) doc.fontSize(8).text(`Discount:`, { continued: true }).text(`-${fmt(discount)}`, { align: 'right' });
    if (tax > 0)      doc.fontSize(8).text(`Tax:`, { continued: true }).text(fmt(tax), { align: 'right' });
    doc.fontSize(9).font('Helvetica-Bold').text(`TOTAL:`, { continued: true }).text(fmt(total), { align: 'right' });
    doc.fontSize(8).font('Helvetica').text(`Payment:`, { continued: true }).text((sale.paymentMethod || 'cash').toUpperCase(), { align: 'right' });

    // QR code for digital receipt
    if (url) {
      const qrDataUrl = await require('../lib/qrpayment').toDataUrl(url, { width: 80 });
      const qrBase64  = qrDataUrl.replace('data:image/png;base64,', '');
      doc.moveDown(0.5).image(Buffer.from(qrBase64, 'base64'), { width: 80, align: 'center' });
      doc.fontSize(7).text(url, { align: 'center' });
    }

    // Footer
    doc.moveDown(0.5).moveTo(10, doc.y).lineTo(216, doc.y).stroke();
    doc.moveDown(0.3).fontSize(8).text(business?.receiptFooter || 'Thank you!', { align: 'center' });
    doc.fontSize(7).text('Powered by Balanzify', { align: 'center' });

    doc.end();
  } catch (err) { next(err); }
});

// ── DIGITAL RECEIPT (PUBLIC) ──────────────────────────────────────

// GET /api/v1/r/:token — public digital receipt, no authentication required
// This is the URL that goes on WhatsApp messages and QR codes
router.get('/r/:token', async (req, res, next) => {
  try {
    const sale = await prisma.sale.findFirst({
      where: { receiptToken: req.params.token },
      include: {
        items:    { include: { product: { select: { name: true } } } },
        customer: { select: { name: true } },
        business: { select: { name: true, address: true, phone: true, logoUrl: true, receiptFooter: true, currency: true } },
      },
    });

    if (!sale) return res.status(404).send('<h2>Receipt not found</h2>');

    const business  = sale.business;
    const currency  = sale.currency || business.currency || 'USD';
    const fmt       = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
    const saleDate  = new Date(sale.createdAt);
    const dateStr   = saleDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const itemRows = sale.items.map(i => `
      <tr>
        <td>${i.quantity}x ${escapeHtml(i.product?.name || 'Item')}</td>
        <td style="text-align:right">${fmt(i.totalPrice)}</td>
      </tr>`).join('');

    const discount = parseFloat(sale.discountAmount || 0);
    const tax      = parseFloat(sale.taxAmount || 0);
    const total    = parseFloat(sale.totalAmount || 0);
    const change   = parseFloat(sale.changeAmount || 0);
    const points   = sale.loyaltyPointsEarned || 0;

    // Serve a clean mobile-optimised HTML receipt
    // No external dependencies — works offline once loaded
    res.set('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt — ${escapeHtml(sale.saleNumber)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #F3F4F6; min-height: 100vh; padding: 16px; }
  .card { background: #fff; max-width: 380px; margin: 0 auto; border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10); overflow: hidden; }
  .header { background: #1B3A6B; color: #fff; padding: 20px; text-align: center; }
  .header h1 { font-size: 20px; font-weight: 800; margin-bottom: 2px; }
  .header p { font-size: 12px; opacity: 0.8; }
  .badge { display: inline-block; background: #22C55E; color: #fff; border-radius: 20px;
           padding: 4px 14px; font-size: 12px; font-weight: 700; margin-top: 10px; }
  .section { padding: 16px; border-bottom: 1px solid #F0F2F5; }
  .meta { display: flex; justify-content: space-between; font-size: 12px;
          color: #6B7280; margin-bottom: 4px; }
  .meta span:last-child { font-weight: 600; color: #111827; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 0; }
  td:last-child { text-align: right; font-weight: 600; }
  .divider { border: none; border-top: 1px dashed #E5E7EB; margin: 8px 0; }
  .total-row td { font-size: 15px; font-weight: 800; color: #1B3A6B; padding-top: 8px; }
  .points { background: #FEF9C3; border-radius: 8px; padding: 8px 12px;
            font-size: 12px; color: #854F0B; font-weight: 600; margin-top: 8px; }
  .footer { padding: 16px; text-align: center; font-size: 12px; color: #6B7280; }
  .footer strong { display: block; margin-bottom: 4px; }
  .powered { font-size: 10px; color: #9CA3AF; margin-top: 8px; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${escapeHtml(business.name)}</h1>
    ${business.address ? `<p>${escapeHtml(business.address)}</p>` : ''}
    ${business.phone   ? `<p>${escapeHtml(business.phone)}</p>`   : ''}
    <div class="badge">✓ Payment Confirmed</div>
  </div>

  <div class="section">
    <div class="meta"><span>Order</span><span>${escapeHtml(sale.saleNumber)}</span></div>
    <div class="meta"><span>Date</span><span>${escapeHtml(dateStr)}</span></div>
    ${sale.customer?.name ? `<div class="meta"><span>Customer</span><span>${escapeHtml(sale.customer.name)}</span></div>` : ''}
  </div>

  <div class="section">
    <table>
      ${itemRows}
      <tr><td colspan="2"><hr class="divider"></td></tr>
      ${discount > 0 ? `<tr><td>Discount</td><td>-${fmt(discount)}</td></tr>` : ''}
      ${tax > 0      ? `<tr><td>Tax</td><td>${fmt(tax)}</td></tr>`            : ''}
      <tr class="total-row"><td>Total</td><td>${fmt(total)}</td></tr>
      <tr><td style="color:#6B7280;font-size:12px">Payment</td>
          <td style="color:#6B7280;font-size:12px;text-transform:uppercase">${escapeHtml(sale.paymentMethod || 'cash')}</td></tr>
      ${change > 0 ? `<tr><td style="font-size:12px">Change</td><td style="font-size:12px">${fmt(change)}</td></tr>` : ''}
    </table>
    ${points > 0 ? `<div class="points">⭐ ${points} loyalty points earned on this purchase</div>` : ''}
  </div>

  <div class="footer">
    <strong>${escapeHtml(business.receiptFooter || 'Thank you for your business!')}</strong>
    <div class="powered">Powered by Balanzify</div>
  </div>
</div>
</body>
</html>`);
  } catch (err) { next(err); }
});

// ── AUTO WhatsApp RECEIPT ─────────────────────────────────────────

// POST /api/v1/checkout/receipt/:saleId/send-whatsapp
// Sends receipt message to customer WhatsApp automatically
router.post('/receipt/:saleId/send-whatsapp', auth, async (req, res, next) => {
  try {
    const sale = await getSaleWithItems(req.params.saleId, req.user.business_id);
    if (!sale) return res.status(404).json({ error: 'Sale not found.' });

    const phone = req.body.phone || sale.customer?.whatsapp || sale.customer?.phone;
    if (!phone) return res.status(400).json({ error: 'No phone number. Provide phone in body or link a customer with WhatsApp.' });

    const business = await prisma.business.findUnique({ where: { id: req.user.business_id } });
    const token    = await getOrCreateReceiptToken(sale.id);
    const url      = receiptUrl(token);

    const items = sale.items.map(i => ({
      productName: i.product?.name || 'Item',
      quantity:    i.quantity,
      unitPrice:   i.unitPrice,
      totalPrice:  i.totalPrice,
    }));

    const message = generateWhatsAppReceipt({ sale, items, business, receiptUrl: url });

    // Deliver through the provider registry (real send when configured, wa.me
    // link otherwise) — tracked in WhatsappLog with provider + delivery status.
    const r = await wa.send({
      businessId: req.user.business_id, to: phone, text: message,
      kind: 'receipt', referenceType: 'sale', referenceId: sale.id,
    });

    res.json({
      message:     r.status === 'link' ? 'Receipt prepared.' : 'Receipt sent.',
      provider:    r.provider,
      status:      r.status,
      wa_url:      r.wa_url,    // present for the link provider — cashier taps to send
      wa_number:   r.phone,
      receipt_url: url,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/checkout/receipt/:saleId/send-email
router.post('/receipt/:saleId/send-email', auth, validate(z.object({
  email: z.string().email(),
})), async (req, res, next) => {
  try {
    const sale = await getSaleWithItems(req.params.saleId, req.user.business_id);
    if (!sale) return res.status(404).json({ error: 'Sale not found.' });

    const business = await prisma.business.findUnique({ where: { id: req.user.business_id } });
    const { sendReceipt } = require('../lib/email');

    const items = sale.items.map(i => ({
      product_name: i.product?.name || 'Item',
      quantity:     i.quantity,
      total_price:  i.totalPrice,
    }));

    await sendReceipt(req.body.email, {
      sale_number:    sale.saleNumber,
      id:             sale.id,
      created_at:     sale.createdAt,
      total_amount:   sale.totalAmount,
      discount_amount: sale.discountAmount,
      payment_method: sale.paymentMethod,
    }, items, business?.name, business?.receiptFooter);

    res.json({ message: `Receipt sent to ${req.body.email}` });
  } catch (err) { next(err); }
});

// ── CUSTOMER DISPLAY ──────────────────────────────────────────────

// POST /api/v1/checkout/display/:businessId
// Cashier pushes current cart state to the customer-facing display
// Called every time cart changes in the POS
router.post('/display/:businessId', auth, async (req, res, next) => {
  try {
    // Only allow cashiers of this business to push state
    if (req.user.business_id !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const state = {
      businessId:  req.params.businessId,
      items:       req.body.items       || [],
      subtotal:    req.body.subtotal     || 0,
      discount:    req.body.discount     || 0,
      total:       req.body.total        || 0,
      currency:    req.body.currency     || 'USD',
      paymentQr:   req.body.paymentQr    || null,  // QR data URL when payment step reached
      status:      req.body.status       || 'browsing', // 'browsing' | 'payment' | 'complete'
      updatedAt:   Date.now(),
    };

    displayState.set(req.params.businessId, state);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/v1/checkout/display/:businessId — no auth (customer-facing screen)
// Returns current cart state for the customer display
// Poll every 2 seconds from the customer screen
router.get('/display/:businessId', async (req, res, next) => {
  try {
    const state = displayState.get(req.params.businessId);
    if (!state) {
      // Get business name for the idle screen
      const business = await prisma.business.findUnique({
        where: { id: req.params.businessId },
        select: { name: true, logoUrl: true, receiptFooter: true },
      });
      return res.json({
        status: 'idle',
        businessName: business?.name || 'Balanzify',
        logoUrl:      business?.logoUrl || null,
        message:      business?.receiptFooter || 'Welcome!',
      });
    }
    // Don't return stale state — if not updated in 5 minutes, show idle
    if (Date.now() - state.updatedAt > 5 * 60 * 1000) {
      displayState.delete(req.params.businessId);
      return res.json({ status: 'idle' });
    }
    res.json(state);
  } catch (err) { next(err); }
});

module.exports = router;
