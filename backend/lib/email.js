const nodemailer = require('nodemailer');
const { logger } = require('./logger');

// ── Transport ─────────────────────────────────────────────────────────────────
// Supports SMTP (any provider) or AWS SES
const createTransport = () => {
  if (process.env.AWS_SES_REGION) {
    // AWS SES via SMTP
    return nodemailer.createTransport({
      host: `email-smtp.${process.env.AWS_SES_REGION}.amazonaws.com`,
      port: 587,
      secure: false,
      auth: {
        user: process.env.AWS_SES_SMTP_USER,
        pass: process.env.AWS_SES_SMTP_PASS,
      },
    });
  }
  // Generic SMTP (Gmail, Mailgun, SendGrid, etc.)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

let transport = null;
const getTransport = () => {
  if (!transport) transport = createTransport();
  return transport;
};

const FROM = process.env.EMAIL_FROM || 'Balanzify <noreply@balanzify.com>';

// ── Base template ─────────────────────────────────────────────────────────────
const baseTemplate = (content, businessName = 'Balanzify') => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F4F6F9;margin:0;padding:20px}
  .container{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:#111827;padding:20px 28px;text-align:center}
  .header h1{color:#fff;font-size:20px;font-weight:600;margin:0;letter-spacing:.5px}
  .header p{color:#9CA3AF;font-size:12px;margin:4px 0 0}
  .body{padding:28px}
  .body p{color:#374151;font-size:14px;line-height:1.6;margin:0 0 14px}
  .btn{display:inline-block;background:#1B3A6B;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0}
  .code{background:#F4F6F9;border-radius:6px;padding:14px;font-family:monospace;font-size:20px;font-weight:700;letter-spacing:4px;text-align:center;color:#1B3A6B;margin:14px 0}
  .divider{border:none;border-top:1px solid #E8ECF0;margin:20px 0}
  .footer{padding:16px 28px;background:#F9FAFB;text-align:center}
  .footer p{color:#9CA3AF;font-size:11px;margin:0}
  table.receipt{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}
  table.receipt td{padding:6px 0;border-bottom:1px solid #F0F2F5;color:#374151}
  table.receipt td:last-child{text-align:right;font-weight:600}
  table.receipt tr:last-child td{border-bottom:none}
</style>
</head>
<body>
<div class="container">
  <div class="header"><h1>${businessName}</h1><p>Powered by Balanzify</p></div>
  <div class="body">${content}</div>
  <div class="footer"><p>This email was sent by Balanzify. If you did not request this, you can safely ignore it.</p></div>
</div>
</body>
</html>`;

// ── Password reset ────────────────────────────────────────────────────────────
const sendPasswordReset = async (to, name, resetUrl, businessName) => {
  const html = baseTemplate(`
    <p>Hi ${name},</p>
    <p>You requested a password reset for your Balanzify account. Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.</p>
    <div style="text-align:center;margin:20px 0">
      <a class="btn" href="${resetUrl}">Reset password</a>
    </div>
    <hr class="divider">
    <p style="font-size:12px;color:#9CA3AF">Or copy this link into your browser:<br><span style="color:#185FA5;word-break:break-all">${resetUrl}</span></p>
    <p style="font-size:12px;color:#9CA3AF">If you did not request a password reset, your account is safe — someone may have entered your email by mistake.</p>
  `, businessName);

  await getTransport().sendMail({
    from: FROM, to,
    subject: 'Reset your Balanzify password',
    html,
  });
  logger.info('email_sent', { type: 'password_reset', to });
};

// ── Receipt email ─────────────────────────────────────────────────────────────
const sendReceipt = async (to, sale, items, businessName, receiptFooter) => {
  const itemRows = items.map(i =>
    `<tr><td>${i.product_name} × ${i.quantity}</td><td>$${parseFloat(i.total_price).toFixed(2)}</td></tr>`
  ).join('');

  const html = baseTemplate(`
    <p>Thank you for your purchase!</p>
    <table class="receipt">
      <tr><td>Order</td><td style="font-family:monospace">${sale.sale_number}</td></tr>
      <tr><td>Date</td><td>${new Date(sale.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td></tr>
    </table>
    <hr class="divider">
    <table class="receipt">
      ${itemRows}
    </table>
    <hr class="divider">
    <table class="receipt">
      ${sale.discount_amount > 0 ? `<tr><td>Discount</td><td>-$${parseFloat(sale.discount_amount).toFixed(2)}</td></tr>` : ''}
      <tr><td><strong>Total</strong></td><td><strong>$${parseFloat(sale.total_amount).toFixed(2)}</strong></td></tr>
      <tr><td>Payment</td><td style="text-transform:capitalize">${sale.payment_method}</td></tr>
    </table>
    ${receiptFooter ? `<hr class="divider"><p style="text-align:center;color:#6B7280;font-size:13px">${receiptFooter}</p>` : ''}
  `, businessName);

  await getTransport().sendMail({
    from: FROM, to,
    subject: `Receipt from ${businessName} — ${sale.sale_number}`,
    html,
  });
  logger.info('email_sent', { type: 'receipt', to, sale_id: sale.id });
};

// ── Low stock alert ───────────────────────────────────────────────────────────
const sendLowStockAlert = async (to, name, products, businessName) => {
  const rows = products.map(p =>
    `<tr><td>${p.name}</td><td>${p.current_stock} ${p.unit_of_measure}</td><td>${p.reorder_point}</td></tr>`
  ).join('');

  const html = baseTemplate(`
    <p>Hi ${name},</p>
    <p>The following products in <strong>${businessName}</strong> have reached their reorder point:</p>
    <table class="receipt">
      <tr><td><strong>Product</strong></td><td><strong>Stock</strong></td><td><strong>Reorder at</strong></td></tr>
      ${rows}
    </table>
    <div style="text-align:center;margin:20px 0">
      <a class="btn" href="${process.env.FRONTEND_URL}/stock">Review stock</a>
    </div>
  `, businessName);

  await getTransport().sendMail({
    from: FROM, to,
    subject: `Low stock alert — ${products.length} product${products.length > 1 ? 's' : ''} need reordering`,
    html,
  });
};

// ── Verify transport on startup ───────────────────────────────────────────────
const verifyEmailConfig = async () => {
  if (!process.env.SMTP_USER && !process.env.AWS_SES_SMTP_USER) {
    logger.warn('email_not_configured', { message: 'SMTP_USER or AWS_SES_SMTP_USER not set — email delivery disabled' });
    return false;
  }
  try {
    await getTransport().verify();
    logger.info('email_transport_ready');
    return true;
  } catch (err) {
    logger.error('email_transport_failed', { message: err.message });
    return false;
  }
};

module.exports = { sendPasswordReset, sendReceipt, sendLowStockAlert, verifyEmailConfig };
