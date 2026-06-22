# Deploy Balanzify — Today

A pilot-ready single-server deploy. Two paths: **Docker (recommended)** and
**bare-metal**. Both have been verified to boot in production mode and pass the
`scripts/contract-smoke.mjs` check (24/24) end to end.

> What you need: one Linux VPS (2 vCPU / 4 GB is plenty for a pilot), and — for a
> public URL — a domain pointed at it. No special hardware. The app is a PWA, so
> merchants install it from the browser on any phone/tablet/PC.

---

## Path A — Docker (one command)

On a fresh Ubuntu server with Docker + Docker Compose installed:

```bash
git clone <your-repo> balanzify && cd balanzify

# 1) Configure (these propagate to the frontend build, CORS, and the DB)
export PUBLIC_API_URL=http://YOUR_SERVER_IP:5050     # where browsers reach the API
export PUBLIC_WEB_URL=http://YOUR_SERVER_IP:3500     # where the frontend is served
export JWT_SECRET=$(openssl rand -hex 64)
export DB_PASSWORD=$(openssl rand -hex 24)

# 2) Build + run the whole stack (Postgres + Redis + API + static frontend)
docker compose -f docker-compose.local.yml up -d --build

# 3) Verify the live contract (auth, sale, reports, capabilities) — expect 24/24
BACKEND_URL=$PUBLIC_API_URL node scripts/contract-smoke.mjs
```

The API container runs `prisma migrate deploy && node server.js` on boot —
**migrations are applied automatically and idempotently** every start. Open
`http://YOUR_SERVER_IP:3500` and register your first business.

**For a real domain + HTTPS** (recommended before onboarding merchants), use the
full `docker-compose.yml`, which adds nginx + Let's Encrypt/certbot — see
`DEPLOY.md`. Set `PUBLIC_API_URL`/`PUBLIC_WEB_URL` to your `https://` URLs.

---

## Path B — Bare-metal (no Docker)

Needs Node 20+, PostgreSQL 16, and a static file server (nginx/Caddy).

```bash
# ── Backend ──────────────────────────────────────────────
cd backend
npm ci --omit=dev
export DATABASE_URL="postgresql://USER:PASS@localhost:5432/balanzify?schema=public"
export JWT_SECRET="$(openssl rand -hex 64)"
export NODE_ENV=production PORT=5050
export ALLOWED_ORIGINS="https://app.yourdomain"   # REQUIRED in production (see gotchas)
export FRONTEND_URL="https://app.yourdomain"
npx prisma migrate deploy        # apply schema
node server.js                   # or run under pm2 / systemd

# ── Frontend (static export) ─────────────────────────────
cd ../frontend
npm ci --legacy-peer-deps
NEXT_PUBLIC_API_MODE=real NEXT_PUBLIC_BACKEND_URL="https://api.yourdomain" npm run build
# Serve the generated ./out directory with nginx/Caddy (SPA fallback to /index.html;
# see frontend/nginx.conf for the exact config).
```

Verify the same way: `BACKEND_URL=https://api.yourdomain node scripts/contract-smoke.mjs`.

---

## Gotchas (learned the hard way — already handled in the compose)

- **The API refuses to boot in production without `ALLOWED_ORIGINS` (or `FRONTEND_URL`).**
  This is a deliberate CORS guard. The compose sets it from `PUBLIC_WEB_URL`.
- **`NEXT_PUBLIC_BACKEND_URL` is baked into the frontend at *build* time**, not read
  at runtime — it must be the URL the *browser* uses to reach the API. Rebuild the
  frontend if it changes.
- **Host port is 5050 → container 5000** (macOS AirPlay squats on 5000). Keep
  `PUBLIC_API_URL`'s port aligned with the published port.
- **`JWT_SECRET` must be ≥ 32 chars** or the server refuses to start.
- First image build pulls base images from Docker Hub — ensure the server has
  outbound network for the initial `up --build`.

---

## What "deployed" gives you on day one

- Multi-vertical POS + inventory + **double-entry accounting** on one ledger.
- **Offline-first**: the till keeps selling with the network down and syncs on
  reconnect (installable PWA, no hardware).
- Mobile-money-aware books, fiscalization spine, Zakat/Hijri, Somali/Arabic + RTL.
- Embedded-finance and delivery modules are present but **opt-in** (and lending
  needs a licence/partner before disbursing — see `docs/COMPETITIVE_ANALYSIS.md`).

Post-deploy, the `contract-smoke` 24/24 is your green light that the full merchant
daily loop works against the live server.
