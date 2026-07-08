// Balanzify service worker — installable PWA + resilience on poor connections.
//
// The app is a static export (immutable, content-hashed assets under
// /_next/static/) served by nginx. The golden rules that keep redeploys from
// breaking the UI:
//   • Never precache a shell that goes stale — cache the LATEST navigation
//     instead, so the offline fallback always matches the current asset hashes.
//   • Navigations are network-first (fresh HTML → fresh asset refs).
//   • Hashed /_next/static assets are cache-first (a URL uniquely identifies its
//     content, so it can never be stale).
//   • API calls are never cached (the app's /sync owns offline data).
// Bump CACHE on any strategy change — activate purges every old cache, which
// self-heals clients stuck on a previous, broken cache.
const CACHE = 'balanzify-shell-v4';

self.addEventListener('install', () => {
  // Don't precache a shell (it goes stale across deploys); activate right away.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Purge every previous cache so a stale/broken cache can't survive a deploy.
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Only our own origin. Cross-origin (fonts, etc.) must reach the network
  // directly — proxying them here trips CSP connect-src.
  if (url.origin !== self.location.origin) return;
  // Business data must be live (or queued by the app's /sync).
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first. Cache the latest good HTML as the shell so the
  // offline fallback references the CURRENT asset hashes.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {}); return res; })
        .catch(() => caches.match('/').then((m) => m || caches.match(req).then((n) => n || Response.error())))
    );
    return;
  }

  // Immutable hashed assets: cache-first (safe — content never changes per URL).
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }))
    );
    return;
  }

  // Other same-origin GETs (icons, manifest, /health…): network-first so a
  // stale copy can never mask a fresh one; fall back to cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); } return res; })
      .catch(() => caches.match(req).then((m) => m || Response.error()))
  );
});
