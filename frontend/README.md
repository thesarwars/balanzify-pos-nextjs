# Balanzify POS — Next.js 14 + TypeScript

A TypeScript / Next.js (App Router) port of the Balanzify POS platform.

**Status:** Phase 5 — **full port complete.** All 37 app screens + auth (Login/Register) are ported to TypeScript App Router routes against the full mock API (`lib/api.ts`, 192 routes). Production build passes (`npm run build` → 43/43 routes prerendered) and every route serves over `next dev`. See `MIGRATION.md` and `PORTING_GUIDE.md`.

Screens: Dashboard · POS · Products (+ Labels, Import/Export) · Customers/Suppliers · Sales (+ returns) · Users & Roles · Locations · Purchases · Transfers · Orders · Discounts · Loyalty · Expenses/Payment Accounts · Adjustments · Invoice Layouts · Reports/Settings/Modules/Insights · generic data screens (categories, stock, stocktake, coupons, petty-cash, projects, tasks) · Restaurant · HRM · Superadmin · Verticals (hotel, pharmacy, wholesale, construction).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

## Stack
- Next.js 14 (App Router) · React 18 · TypeScript 5
- Inline-style design tokens (`lib/theme.ts`) — no CSS framework
- Mock⇄live API client (`lib/api.ts`); flip `API_CONFIG.mode` to `'live'` + set `baseUrl`

## Layout
```
app/        routes + layout (App Router)
components/ kit.tsx (primitives) + per-screen components
lib/        theme.ts, api.ts (+ types.ts, mock/ to add)
```

See `MIGRATION.md` and the prototype's `docs/` for the full spec.
