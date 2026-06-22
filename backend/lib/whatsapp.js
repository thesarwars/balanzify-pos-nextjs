/**
 * WhatsApp delivery service — the customer-comms spine.
 *
 * These markets are WhatsApp-first, so receipts, payment reminders and statements
 * go out over WhatsApp rather than email/SMS. Historically the app only built
 * `wa.me` click-to-chat links (the cashier taps to send by hand). This service
 * turns that into real, trackable delivery behind a pluggable provider registry:
 *
 *   - cloud  — Meta WhatsApp Cloud API (programmatic send)
 *   - twilio — Twilio WhatsApp
 *   - link   — wa.me deep link (zero-config fallback; what the app did before)
 *
 * With no provider configured it falls back to `link`, so an unconfigured install
 * (and the test suite) keeps working deterministically with no network calls.
 * Every send is written to WhatsappLog with provider + delivery status, so the
 * comms journey is observable instead of fire-and-forget.
 */
const prisma = require('./prisma');

const DEFAULT_CC = process.env.WA_DEFAULT_CC || '252'; // Somaliland/Somalia first

/**
 * Normalize a phone to bare international digits (no +). Local numbers with a
 * leading 0 get the business/default country code; 00-prefixed are treated as
 * already-international. Returns '' if there's nothing usable.
 */
function normalizePhone(raw, cc = DEFAULT_CC) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `${cc}${d.slice(1)}`;
  return d;
}

function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ── Providers ────────────────────────────────────────────────────────────────
// Each returns { status, providerMessageId?, wa_url?, error? }. They must never
// throw — a delivery failure is data (status: 'failed'), not an exception that
// aborts the caller's batch.

const providers = {
  link({ phone, text }) {
    return { status: 'link', wa_url: waLink(phone, text) };
  },

  async cloud({ phone, text }) {
    const token = process.env.WA_CLOUD_TOKEN, phoneId = process.env.WA_CLOUD_PHONE_ID;
    if (!token || !phoneId) return { status: 'failed', error: 'cloud provider not configured' };
    try {
      const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return { status: 'failed', error: json?.error?.message || `HTTP ${resp.status}` };
      return { status: 'sent', providerMessageId: json?.messages?.[0]?.id || null };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  },

  async twilio({ phone, text }) {
    const sid = process.env.WA_TWILIO_SID, token = process.env.WA_TWILIO_TOKEN, from = process.env.WA_TWILIO_FROM;
    if (!sid || !token || !from) return { status: 'failed', error: 'twilio provider not configured' };
    try {
      const body = new URLSearchParams({ To: `whatsapp:+${phone}`, From: `whatsapp:${from}`, Body: text });
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return { status: 'failed', error: json?.message || `HTTP ${resp.status}` };
      return { status: 'sent', providerMessageId: json?.sid || null };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  },
};

/** Which provider this install uses. Defaults to the zero-config link fallback. */
function resolveProviderName() {
  const name = (process.env.WA_PROVIDER || 'link').toLowerCase();
  return providers[name] ? name : 'link';
}

/**
 * Send one WhatsApp message and record it. Never throws on a delivery problem —
 * returns a result the caller can report per-recipient.
 *   send({ businessId, to, text, kind, referenceType, referenceId, cc })
 *     → { ok, status, provider, wa_url?, log_id, phone, error? }
 */
async function send({ businessId, to, text, kind = 'message', referenceType = null, referenceId = null, cc = DEFAULT_CC }) {
  const phone = normalizePhone(to, cc);
  if (!phone) return { ok: false, status: 'failed', error: 'no usable phone number', phone: '' };

  const providerName = resolveProviderName();
  const result = await providers[providerName]({ phone, text });
  const ok = result.status === 'sent' || result.status === 'link';

  let logId = null;
  try {
    const log = await prisma.whatsappLog.create({
      data: {
        businessId, recipientPhone: phone, messageType: kind, content: text,
        referenceType, referenceId,
        provider: providerName, status: result.status,
        providerMessageId: result.providerMessageId || null,
        errorDetail: result.error || null,
      },
    });
    logId = log.id;
  } catch { /* logging must not break delivery */ }

  return { ok, status: result.status, provider: providerName, wa_url: result.wa_url, log_id: logId, phone, error: result.error };
}

module.exports = { send, normalizePhone, waLink, resolveProviderName, providers, DEFAULT_CC };
