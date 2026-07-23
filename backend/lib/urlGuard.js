// Outbound-request guard — blocks server-side connections to private/internal
// destinations (SSRF). Tenant-supplied hosts (custom SMS gateway URLs, SMTP
// servers) must resolve to public addresses before the server reaches them.
// guardedFetch additionally pins the socket to the vetted IP (a `lookup`
// override), so DNS cannot re-resolve to an internal host between the check
// and the connect, and never follows redirects — a public URL answering
// 302 → intranet would otherwise bypass the whole check.
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

const guardError = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

// Expand an IPv6 literal into its 8 words, folding a trailing dotted quad
// (::ffff:10.0.0.1) into hex first. Returns null when malformed.
function v6Words(ip) {
  let s = ip;
  if ((s.match(/::/g) || []).length > 1) return null;
  const v4 = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const o = v4[2].split('.').map(Number);
    if (o.some((n) => n > 255)) return null;
    s = v4[1] + (((o[0] << 8) | o[1]).toString(16)) + ':' + (((o[2] << 8) | o[3]).toString(16));
  }
  const [headStr, tailStr] = s.split('::');
  const head = headStr ? headStr.split(':') : [];
  const tail = tailStr ? tailStr.split(':') : [];
  const fill = s.includes('::') ? 8 - head.length - tail.length : 0;
  const words = [...head, ...Array(Math.max(fill, 0)).fill('0'), ...tail]
    .map((w) => (/^[0-9a-f]{1,4}$/.test(w) ? parseInt(w, 16) : NaN));
  return words.length === 8 && words.every((w) => Number.isInteger(w)) ? words : null;
}

const embeddedV4 = (hi, lo) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

// True when the address sits in a loopback/private/link-local/reserved range.
function isPrivateIp(addr) {
  const ip = String(addr || '').toLowerCase();
  if (ip.includes(':')) {
    if (ip.includes('%')) return true;                         // zone-scoped → link-local
    const w = v6Words(ip);
    if (!w) return true;                                       // malformed → refuse
    if (w.slice(0, 6).every((x) => x === 0)) return true;      // ::, ::1, v4-compatible ::a.b.c.d
    if (w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff) {
      return isPrivateIp(embeddedV4(w[6], w[7]));              // v4-mapped ::ffff:a.b.c.d (any spelling)
    }
    if (w[0] === 0x64 && w[1] === 0xff9b && !w[2] && !w[3] && !w[4] && !w[5]) {
      return isPrivateIp(embeddedV4(w[6], w[7]));              // NAT64 64:ff9b::/96
    }
    if (w[0] === 0x64 && w[1] === 0xff9b && w[2] === 1) return true; // local-use NAT64 64:ff9b:1::/48
    if (w[0] === 0x2002) return isPrivateIp(embeddedV4(w[1], w[2])); // 6to4 2002::/16
    if (w[0] === 0x100 && !w[1] && !w[2] && !w[3]) return true; // 100::/64 discard
    if (w[0] === 0x2001 && (w[1] === 0 || w[1] === 0xdb8)) return true; // Teredo, documentation
    if ((w[0] & 0xffc0) === 0xfe80) return true;               // fe80::/10 link-local
    if ((w[0] & 0xffc0) === 0xfec0) return true;               // fec0::/10 site-local (deprecated)
    if ((w[0] & 0xfe00) === 0xfc00) return true;               // fc00::/7 unique-local
    if ((w[0] & 0xff00) === 0xff00) return true;               // multicast
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → refuse
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127                      // "this network", 10/8, loopback
    || (a === 100 && b >= 64 && b <= 127)                      // CGNAT 100.64/10
    || (a === 169 && b === 254)                                // link-local + cloud metadata (169.254.169.254)
    || (a === 172 && b >= 16 && b <= 31)                       // 172.16/12
    || (a === 192 && b === 0 && (c === 0 || c === 2))          // 192.0.0/24 IANA special, 192.0.2/24 TEST-NET-1
    || (a === 192 && b === 168)                                // 192.168/16 — the rest of 192.0/16 is public
    || (a === 198 && b === 51 && c === 100)                    // TEST-NET-2
    || (a === 203 && b === 0 && c === 113)                     // TEST-NET-3
    || (a === 198 && (b === 18 || b === 19))                   // benchmarking 198.18/15
    || a >= 224;                                               // multicast, reserved, broadcast
}

// Accepts a bare hostname/IP or a full URL. Resolves the destination and throws
// (statusCode 400) unless every resolved address is public. Full URLs must be
// http(s) without embedded credentials. Returns { host, address, family } —
// the address is the one callers should pin their connection to. Callers that
// let a library re-resolve the host (e.g. nodemailer for SMTP) accept a small
// check-vs-connect DNS window; HTTP callers should use guardedFetch, which pins.
async function assertPublicHost(hostOrUrl) {
  let host = String(hostOrUrl || '').trim();
  if (!host) throw guardError('No host configured.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
    let url;
    try { url = new URL(host); } catch { throw guardError('Invalid URL.'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw guardError('Only http(s) URLs are allowed.');
    if (url.username || url.password) throw guardError('Credentials in the URL are not allowed — use headers or params.');
    host = url.hostname;
  }
  host = host.replace(/^\[|\]$/g, '');                          // bracketed IPv6 literal
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw guardError('Host resolves to a private or internal address.');
    return { host, address: host, family: net.isIP(host) };
  }
  let addrs;
  try {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw guardError('Host could not be resolved.');
  }
  if (!addrs.length || addrs.some(({ address }) => isPrivateIp(address))) {
    throw guardError('Host resolves to a private or internal address.');
  }
  return { host, address: addrs[0].address, family: addrs[0].family };
}

// Parse + vet a tenant-supplied URL. Returns { url, address, family }.
async function assertPublicUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { throw guardError('Invalid URL.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw guardError('Only http(s) URLs are allowed.');
  if (url.username || url.password) throw guardError('Credentials in the URL are not allowed — use headers or params.');
  const { address, family } = await assertPublicHost(url.hostname);
  return { url, address, family };
}

// fetch-lite for tenant-supplied URLs: vets the URL, then connects to the
// vetted IP via a `lookup` override (TLS SNI/certificate checks still run
// against the hostname). Never follows redirects. `body`, when present, must
// be a string or Buffer. Returns { ok, status, text(), json() }.
async function guardedFetch(rawUrl, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  const { url, address, family } = await assertPublicUrl(rawUrl);
  const lookup = (host, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    return opts && opts.all ? cb(null, [{ address, family }]) : cb(null, address, family);
  };
  const res = await new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method,
      headers: body != null ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers,
      lookup,
      timeout: timeoutMs,
    }, resolve);
    req.on('timeout', () => req.destroy(new Error('Gateway timed out.')));
    req.on('error', reject);
    req.end(body != null ? body : undefined);
  });
  const chunks = [];
  let size = 0;
  try {
    for await (const c of res) {
      size += c.length;
      if (size > 1024 * 1024) { res.destroy(); break; }         // a gateway reply is small — cap the buffer
      chunks.push(c);
    }
  } catch { /* truncated body reads as empty — the status was already received */ }
  const text = Buffer.concat(chunks).toString('utf8');
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

module.exports = { assertPublicHost, assertPublicUrl, guardedFetch, isPrivateIp };
