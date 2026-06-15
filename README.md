# balanzify-pos-nextjs

Balanzify POS — a multi-vertical Point-of-Sale + Inventory + Accounting + HRM platform.

Monorepo:

- **`frontend/`** — Next.js 14 (App Router, TypeScript) UI. Static-export build served by nginx. Runs against an in-browser **mock** (default) or the real backend (`NEXT_PUBLIC_API_MODE=real`).
- **`backend/`** — Express + Prisma + PostgreSQL API (`/api/v1/...`), JWT auth.
- **`infrastructure/`** — nginx, Terraform, monitoring.
- **`scripts/`** — AWS/EC2 deploy + SSL helpers.

## Run locally with Docker (no nginx/SSL)

Frontend on **:3500**, API on **:5000**, Postgres + Redis internal:

```bash
docker compose -f docker-compose.local.yml up -d --build
# open http://localhost:3500  → register a business, then sign in
```

Stop: `docker compose -f docker-compose.local.yml down`

## Frontend only (mock, no backend)

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

## Production

`docker-compose.yml` / `docker-compose.ec2.yml` bring up postgres + redis + api + frontend + nginx + certbot (SSL). See `DEPLOY.md`.
