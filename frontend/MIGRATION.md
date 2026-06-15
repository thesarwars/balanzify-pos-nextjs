# Migrating Balanzify POS → Next.js 14 + TypeScript

This scaffold (Phase 1) ports the **foundation**. The remaining work is mechanical — this guide is the recipe.

## Run it

```bash
cd balanzify-next
npm install
npm run dev      # http://localhost:3000
```

The home page renders the ported design tokens + primitives (proof the foundation works).

## What's already ported
| Prototype file | → Next.js |
|---|---|
| `theme.jsx` | `lib/theme.ts` (typed `makeTheme`, `ACCENTS`, `money`) |
| `kit.jsx` | `components/kit.tsx` (`Btn`, `Badge`, `Panel`, `Modal`, `StatCard`, `Field`, `TextField`) |
| `api.jsx` | `lib/api.ts` (typed `transport` + `API` groups skeleton + `MOCK_ROUTES`) |
| entry HTML | `app/layout.tsx` + `app/globals.css` (fonts, resets, keyframes) |

## Conversion recipe (per file)

1. **Globals → ES modules.** Replace `Object.assign(window, {X})` with `export`. Replace bare cross-file refs (`PRODUCTS`, `makeTheme`, `API`) with `import { X } from '@/lib/...'`.
2. **Client components.** Any file using hooks/handlers gets `'use client'` at the top.
3. **Type the props.** Each component takes `{ T: Theme, ... }`. Add an interface; reuse `Theme` from `lib/theme`.
4. **Inline styles unchanged** — they already match React's style object; just satisfy `React.CSSProperties` typing (cast `as const` where TS complains about string unions like `position`).
5. **Data.** Port `data.jsx`/`data2.jsx` seed arrays into `lib/mock/seed.ts` (typed with the `SCHEMA.md` interfaces). Add `lib/types.ts` from `SCHEMA.md`.
6. **API.** Port each `route(method, path, handler)` from `api.jsx` into `MOCK_ROUTES` in `lib/api.ts` (key = `"METHOD /path/with/:id"`). Add the matching `API.<group>` methods. For **live** mode, set `API_CONFIG.mode='live'` + `baseUrl`; OR implement Next API routes under `app/api/connector/...` that proxy your real backend.
7. **Screens → routes.** Each screen becomes `app/(app)/<route>/page.tsx` (client component). Build a shared `app/(app)/layout.tsx` that renders `<Sidebar>` + `<Topbar>` (port `Shell.jsx`) and passes `T`.
8. **Modals/managers** stay as child components in the same screen file (or `components/<screen>/`), same `{T, …, onClose, onSaved}` shape.
9. **Tweaks.** Replace the host tweaks overlay with a React context (`ThemeProvider`) holding `{accent,type,sidebar}` and exposing `T = makeTheme(...)`.

## Suggested route map (App Router)
```
app/
  layout.tsx                 root (fonts)
  page.tsx                   → redirect to /pos or login
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (app)/layout.tsx           Sidebar + Topbar shell
  (app)/dashboard/page.tsx
  (app)/pos/page.tsx
  (app)/products/page.tsx
  (app)/contacts/page.tsx
  (app)/sales/page.tsx
  (app)/users/page.tsx
  (app)/locations/page.tsx
  (app)/purchases/page.tsx
  (app)/transfers/page.tsx
  (app)/orders/page.tsx
  (app)/discounts/page.tsx
  (app)/finance/page.tsx
  (app)/adjustments/page.tsx
  (app)/invoice-layouts/page.tsx
  (app)/loyalty/page.tsx
  (app)/reports/page.tsx
  (app)/modules/page.tsx
  (app)/restaurant/page.tsx   (gated add-on)
  (app)/hrm/page.tsx          (gated add-on)
  (app)/superadmin/page.tsx   (gated add-on)
  api/connector/[...]/route.ts  (optional live backend proxy)
components/
  kit.tsx, shell.tsx, <per-screen children>
lib/
  theme.ts, api.ts, types.ts, mock/seed.ts, mock/routes.ts
```

## Order to port (lowest risk first)
theme/kit/api (done) → types/seed → shell/layout → Dashboard → Products → POS → Contacts/Sales → Users/Locations/Purchases/Orders/Finance → Discounts/Loyalty/Adjustments/InvoiceLayouts → Reports/Modules → HRM → Restaurant → Superadmin.

Reference the original prototype's `docs/COMPONENTS.md` for each component's state/props/calls while porting.
