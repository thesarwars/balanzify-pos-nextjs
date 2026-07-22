// ── SMS engine — driver-based, secrets server-side only ──────────────────────
// Drivers: africastalking (the East-African standard), twilio (the global
// default), custom (generic HTTP for anything else). Config lives in
// Business.smsConfig, which never travels to the browser unredacted.
// Every attempt lands in sms_logs.
const prisma = require('./prisma');

const SECRET_KEYS = ['at_api_key', 'twilio_auth_token', 'custom_headers'];

/** Config safe to show a browser: secrets become `<key>_set` booleans. */
function redact(cfg) {
  const c = { ...(cfg || {}) };
  for (const k of SECRET_KEYS) {
    c[`${k}_set`] = Boolean(c[k]);
    delete c[k];
  }
  return c;
}

/** Merge an update over stored config; empty/absent secrets keep the stored value. */
function mergeConfig(stored, incoming) {
  const next = { ...(stored || {}), ...(incoming || {}) };
  for (const k of SECRET_KEYS) {
    if (incoming && (incoming[k] === '' || incoming[k] == null)) next[k] = (stored || {})[k];
  }
  return next;
}

async function deliver(cfg, to, message) {
  const driver = cfg.driver || 'custom';

  if (driver === 'africastalking') {
    if (!cfg.at_username || !cfg.at_api_key) throw new Error('Africa\'s Talking username and API key are required.');
    const body = new URLSearchParams({ username: cfg.at_username, to, message });
    if (cfg.sender_id) body.set('from', cfg.sender_id);
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey: cfg.at_api_key, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    const json = await res.json().catch(() => ({}));
    const first = json?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !first || !['Success', 'Sent'].includes(first.status)) {
      throw new Error(first?.status || json?.SMSMessageData?.Message || `Africa's Talking HTTP ${res.status}`);
    }
    return;
  }

  if (driver === 'twilio') {
    if (!cfg.twilio_sid || !cfg.twilio_auth_token || !cfg.sender_id) {
      throw new Error('Twilio Account SID, Auth Token and From number are required.');
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twilio_sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${cfg.twilio_sid}:${cfg.twilio_auth_token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: cfg.sender_id, To: to, Body: message }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || `Twilio HTTP ${res.status}`);
    return;
  }

  // Generic HTTP — the reference's screen, kept as the escape hatch.
  if (!cfg.custom_url) throw new Error('The custom gateway URL is required.');
  const params = { [cfg.custom_to_param || 'to']: to, [cfg.custom_msg_param || 'text']: message };
  for (const p of cfg.custom_params || []) if (p && p.key) params[p.key] = p.value || '';
  let headers = {};
  try { headers = typeof cfg.custom_headers === 'object' ? (cfg.custom_headers || {}) : JSON.parse(cfg.custom_headers || '{}'); }
  catch { headers = {}; }
  const method = (cfg.custom_method || 'POST').toUpperCase();
  let res;
  if (method === 'GET') {
    const url = new URL(cfg.custom_url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    res = await fetch(url, { headers });
  } else if ((cfg.custom_body_type || 'form') === 'json') {
    res = await fetch(cfg.custom_url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(params) });
  } else {
    res = await fetch(cfg.custom_url, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(params) });
  }
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

/** Send one SMS and log the attempt. Throws on failure (after logging). */
async function sendSms(businessId, to, message, createdById) {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { smsConfig: true } });
  const cfg = biz && biz.smsConfig;
  if (!cfg || !cfg.driver) throw Object.assign(new Error('SMS is not configured — set it up under Business Settings → SMS.'), { statusCode: 400 });
  const provider = cfg.driver;
  try {
    await deliver(cfg, to, message);
    await prisma.smsLog.create({ data: { businessId, to, message, provider, status: 'sent', createdById: createdById || null } });
  } catch (err) {
    await prisma.smsLog.create({ data: { businessId, to, message, provider, status: 'failed', error: String(err.message || err).slice(0, 500), createdById: createdById || null } }).catch(() => {});
    throw Object.assign(new Error(`SMS failed: ${err.message}`), { statusCode: 502 });
  }
}

module.exports = { sendSms, redact, mergeConfig, SECRET_KEYS };
