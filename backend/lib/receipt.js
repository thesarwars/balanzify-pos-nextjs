/**
 * Receipt Engine
 *
 * Handles all receipt generation for Balanzify:
 *   1. ESC/POS thermal printer bytes — for Bluetooth/USB receipt printers
 *   2. Digital receipt HTML — public URL, no login required
 *   3. WhatsApp receipt message — auto-sent on sale completion
 *   4. PDF receipt — for corporate/hotel folios
 *
 * ESC/POS is the universal thermal printer standard.
 * Every cheap Bluetooth printer (Epson, Star, Xprinter, generic Chinese)
 * supports the same core command set. No driver needed — raw bytes over BT.
 */

const QRCode = require('qrcode');
const crypto  = require('crypto');

// ── ESC/POS Constants ─────────────────────────────────────────────
// These byte sequences are universal across all ESC/POS printers
const ESC  = 0x1B;
const GS   = 0x1D;
const LF   = 0x0A;  // Line feed (new line)
const INIT          = Buffer.from([ESC, 0x40]);          // Initialize printer
const ALIGN_LEFT    = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER  = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_RIGHT   = Buffer.from([ESC, 0x61, 0x02]);
const BOLD_ON       = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF      = Buffer.from([ESC, 0x45, 0x00]);
const DOUBLE_HEIGHT = Buffer.from([ESC, 0x21, 0x10]);
const NORMAL_SIZE   = Buffer.from([ESC, 0x21, 0x00]);
const UNDERLINE_ON  = Buffer.from([ESC, 0x2D, 0x01]);
const UNDERLINE_OFF = Buffer.from([ESC, 0x2D, 0x00]);
const CUT_PAPER     = Buffer.from([GS,  0x56, 0x42, 0x00]); // Full cut
const FEED_LINES    = (n) => Buffer.from([ESC, 0x64, n]);   // Feed n lines

const RECEIPT_WIDTH = 32; // Characters wide for 58mm paper (common in Africa)
// For 80mm paper use 48 — configurable per business printer model

/**
 * Right-pad a string to width
 */
function padEnd(str, width) {
  const s = String(str);
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

/**
 * Left-align label, right-align value on same line
 */
function labelValue(label, value, width = RECEIPT_WIDTH) {
  const l = String(label);
  const v = String(value);
  const gap = width - l.length - v.length;
  if (gap < 1) return (l + ' ' + v).slice(0, width);
  return l + ' '.repeat(gap) + v;
}

/**
 * Center a string within width
 */
function center(str, width = RECEIPT_WIDTH) {
  const s = String(str);
  if (s.length >= width) return s;
  const pad = Math.floor((width - s.length) / 2);
  return ' '.repeat(pad) + s;
}

/**
 * Dashed divider line
 */
function divider(width = RECEIPT_WIDTH) {
  return '-'.repeat(width);
}

/**
 * Format currency — simple, no library dependency
 */
function fmt(amount, currency = 'USD') {
  const n = parseFloat(amount || 0).toFixed(2);
  return `${currency} ${n}`;
}

/**
 * Generate ESC/POS receipt bytes for a completed sale.
 * Returns a Buffer that can be sent directly to a thermal printer.
 *
 * @param {object} sale    - sale record from DB
 * @param {object[]} items - sale items with product names
 * @param {object} business - business record
 * @param {string} [receiptUrl] - digital receipt URL (printed as QR if provided)
 * @returns {Promise<Buffer>}
 */
async function generateEscPos({ sale, items, business, receiptUrl }) {
  const parts = [];

  const push = (buf) => parts.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf + '\n', 'ascii'));

  // ── Header ────────────────────────────────────────────────────────
  parts.push(INIT);
  parts.push(ALIGN_CENTER);
  parts.push(DOUBLE_HEIGHT);
  push(business.name || 'Balanzify');
  parts.push(NORMAL_SIZE);

  if (business.address) push(business.address);
  if (business.phone)   push(business.phone);
  if (business.taxNumber) push(`TIN: ${business.taxNumber}`);

  if (business.receiptHeader) {
    push('');
    push(business.receiptHeader);
  }

  push('');
  parts.push(ALIGN_LEFT);
  push(divider());

  // ── Sale info ─────────────────────────────────────────────────────
  const saleDate = new Date(sale.createdAt || sale.created_at);
  const dateStr  = saleDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr  = saleDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  push(labelValue('Order:', sale.saleNumber || sale.sale_number));
  push(labelValue('Date:', `${dateStr} ${timeStr}`));
  if (sale.cashierName) push(labelValue('Cashier:', sale.cashierName));
  push(divider());

  // ── Items ─────────────────────────────────────────────────────────
  for (const item of items) {
    const name     = (item.productName || item.product_name || item.name || 'Item').slice(0, 20);
    const qty      = item.quantity;
    const price    = parseFloat(item.unitPrice || item.unit_price || 0);
    const total    = parseFloat(item.totalPrice || item.total_price || price * qty);
    const currency = sale.currency || business.currency || 'USD';

    // Item name line
    push(`${qty}x ${name}`);
    // Price right-aligned on next line with indent
    push(labelValue(`  @ ${fmt(price, currency)}`, fmt(total, currency)));

    // Modifiers (if restaurant order)
    if (item.modifiers?.length) {
      for (const mod of item.modifiers) {
        push(`  + ${mod.name || mod}`);
      }
    }
    if (item.notes) push(`  * ${item.notes}`);
  }

  push(divider());

  // ── Totals ────────────────────────────────────────────────────────
  const currency = sale.currency || business.currency || 'USD';
  const subtotal = parseFloat(sale.subtotalAmount || sale.subtotal_amount || sale.totalAmount || sale.total_amount || 0);
  const discount = parseFloat(sale.discountAmount || sale.discount_amount || 0);
  const coupon   = parseFloat(sale.couponDiscount || sale.coupon_discount || 0);
  const loyalty  = parseFloat(sale.loyaltyDiscount || sale.loyalty_discount || 0);
  const tax      = parseFloat(sale.taxAmount || sale.tax_amount || 0);
  const tip      = parseFloat(sale.tipAmount || sale.tip_amount || 0);
  const total    = parseFloat(sale.totalAmount || sale.total_amount || 0);

  if (discount > 0) push(labelValue('Discount:', `-${fmt(discount, currency)}`));
  if (coupon   > 0) push(labelValue('Coupon:', `-${fmt(coupon, currency)}`));
  if (loyalty  > 0) push(labelValue('Loyalty:', `-${fmt(loyalty, currency)}`));
  if (tax      > 0) push(labelValue('Tax:', fmt(tax, currency)));
  if (tip      > 0) push(labelValue('Tip:', fmt(tip, currency)));

  parts.push(BOLD_ON);
  push(labelValue('TOTAL:', fmt(total, currency)));
  parts.push(BOLD_OFF);

  // Payment method
  const pm = (sale.paymentMethod || sale.payment_method || 'cash').toUpperCase();
  push(labelValue('Payment:', pm));

  // Cash change
  const change = parseFloat(sale.changeAmount || sale.change_amount || 0);
  if (change > 0) push(labelValue('Change:', fmt(change, currency)));

  // Display amount (diaspora currency)
  if (sale.display_amount) {
    push('');
    push(labelValue(`Also: ${sale.display_amount.currency}`, parseFloat(sale.display_amount.amount).toFixed(2)));
  }

  // Tax breakdown
  if (sale.tax_breakdown?.length) {
    push('');
    push(divider());
    push('TAX BREAKDOWN');
    for (const tb of sale.tax_breakdown) {
      push(labelValue(`  ${tb.name}:`, fmt(tb.taxAmount, currency)));
    }
  }

  // Loyalty points earned
  const pointsEarned = sale.loyaltyPointsEarned || sale.loyalty_points_earned || 0;
  if (pointsEarned > 0) {
    push('');
    push(center(`+${pointsEarned} loyalty points earned`));
  }

  // ── Digital receipt QR ────────────────────────────────────────────
  if (receiptUrl) {
    push('');
    push(divider());
    parts.push(ALIGN_CENTER);
    push('Scan for digital receipt:');
    push('');

    // ESC/POS QR code command sequence
    const urlBytes  = Buffer.from(receiptUrl, 'utf8');
    const urlLen    = urlBytes.length + 3;
    const qrModule  = 4; // QR dot size (2-8, larger = bigger QR)
    const qrEcc     = 0x31; // Error correction level M

    const qrCmds = Buffer.concat([
      // Set QR model 2
      Buffer.from([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
      // Set module size
      Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, qrModule]),
      // Set error correction
      Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, qrEcc]),
      // Store data
      Buffer.from([GS, 0x28, 0x6B,
        (urlLen) & 0xFF, ((urlLen) >> 8) & 0xFF,
        0x31, 0x50, 0x30]),
      urlBytes,
      // Print QR
      Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]),
    ]);

    parts.push(qrCmds);
    push('');
    push(receiptUrl.replace('https://', ''));
    parts.push(ALIGN_LEFT);
  }

  // ── Footer ────────────────────────────────────────────────────────
  push('');
  push(divider());
  parts.push(ALIGN_CENTER);
  push(business.receiptFooter || 'Thank you for your business!');
  push('Powered by Balanzify');
  push('');
  parts.push(FEED_LINES(4));
  parts.push(CUT_PAPER);

  return Buffer.concat(parts);
}

/**
 * Generate WhatsApp receipt message text.
 * Formatted for mobile readability — short lines, emoji for structure.
 */
function generateWhatsAppReceipt({ sale, items, business, receiptUrl }) {
  const currency = sale.currency || business.currency || 'USD';
  const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
  const date = new Date(sale.createdAt || sale.created_at);
  const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const itemLines = items.map(i => {
    const name  = i.productName || i.product_name || i.name || 'Item';
    const qty   = i.quantity;
    const total = parseFloat(i.totalPrice || i.total_price || 0);
    return `  ${qty}x ${name} — ${fmt(total)}`;
  }).join('\n');

  const total    = parseFloat(sale.totalAmount || sale.total_amount || 0);
  const discount = parseFloat(sale.discountAmount || sale.discount_amount || 0);
  const tax      = parseFloat(sale.taxAmount || sale.tax_amount || 0);
  const points   = sale.loyaltyPointsEarned || sale.loyalty_points_earned || 0;

  let msg = `🧾 *Receipt from ${business.name}*\n`;
  msg += `📋 Order: ${sale.saleNumber || sale.sale_number}\n`;
  msg += `📅 ${dateStr}\n`;
  msg += `─────────────────────\n`;
  msg += itemLines + '\n';
  msg += `─────────────────────\n`;
  if (discount > 0) msg += `🏷️ Discount: -${fmt(discount)}\n`;
  if (tax > 0)      msg += `🧾 Tax: ${fmt(tax)}\n`;
  msg += `💰 *Total: ${fmt(total)}*\n`;
  msg += `💳 Payment: ${(sale.paymentMethod || sale.payment_method || 'cash').toUpperCase()}\n`;
  if (points > 0) msg += `⭐ Loyalty points earned: +${points}\n`;
  if (receiptUrl) msg += `\n📱 Full receipt: ${receiptUrl}`;
  if (business.receiptFooter) msg += `\n\n${business.receiptFooter}`;

  return msg;
}

/**
 * Generate a secure random receipt token (48 hex chars = 24 bytes)
 * Unguessable — safe to use in public URLs
 */
function generateReceiptToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Build the public digital receipt URL
 */
function receiptUrl(token, baseUrl) {
  const base = baseUrl || process.env.FRONTEND_URL || 'https://app.balanzify.com';
  return `${base}/r/${token}`;
}

module.exports = {
  generateEscPos,
  generateWhatsAppReceipt,
  generateReceiptToken,
  receiptUrl,
  RECEIPT_WIDTH,
};
