# Porting guide — prototype `.jsx` → balanzify-next `.tsx`

Mechanical, faithful port. **Preserve ALL functionality, modals, managers, drawers, tabs, behaviours.** Do NOT simplify or drop features. Keep every inline style verbatim.

## Source & target
- Prototype source root: `/Users/sarwars/Desktop/Projects/Jumatechs/Balanzify/pos-root/app/`
- Target: `/Users/sarwars/Desktop/Projects/Jumatechs/Balanzify/pos-root/balanzify-next/`

## The shared contract — import these instead of relying on globals
The prototype uses one global scope (every file sees `BUSINESS`, `PRODUCTS`, `API`, `Btn`, `money`, etc. with no imports). In the port, add explicit imports:

```ts
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0, moneyParts, timeAgo, makeTheme } from '@/lib/theme';
import { Btn, Badge, Trend, StatCard, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast, useViewport, methodTone, swatchBg } from '@/components/kit';
import { Topbar, useTheme } from '@/components/shell';
import { API } from '@/lib/api';
// Seed/reference data (only import what the file actually uses):
import { BUSINESS, CASHIER, CATEGORIES, PRODUCTS, PAYMENT_METHODS, SALES, DASH,
         CUSTOMERS, SUPPLIERS, PURCHASE_ORDERS, STOCK_ROWS, STOCKTAKE, COUPONS, LOYALTY,
         PETTY_CASH, ADJUSTMENTS, TRANSFERS, LOCATIONS, USERS, PROJECTS, TASKS, DATA } from '@/lib/data';
```

Only import the names a given file references. `React` hooks: write `React.useState` / `React.useEffect` (or destructure `const { useState, useEffect } = React;`).

## Rules
1. **First line of every component file:** `'use client';`
2. **Screen → page.** The prototype's top-level screen component takes `{ T, ... }`. Convert it to a Next page:
   ```tsx
   'use client';
   // ...imports
   export default function ProductsPage() {
     const T = useTheme();
     return <ProductsScreen T={T} />;
   }
   function ProductsScreen({ T }: { T: Theme }) { /* original body, verbatim */ }
   ```
   Child components (modals, managers, rows, drawers) stay in the **same file**, each still taking `T` (and other props) as before.
   - If a screen takes a prop from the router (e.g. Contacts `kind`, Finance `tab`), make the screen component accept it and have the page pass it.
3. **Typing is loose.** Add `: any` to function params, state generics, map callbacks, event handlers where TS would otherwise complain. Props interfaces: `{ T: Theme; onClose: () => void; ... }` with `any` for data objects. `noImplicitAny` is on, so annotate params. `next.config.mjs` already sets `ignoreBuildErrors`, but avoid gratuitous errors.
4. **Inline styles unchanged.** They already match React. If TS complains about a string-union CSS prop (e.g. `position`, `textAlign`, `whiteSpace`), cast the whole style object `as React.CSSProperties` or add `as const`. Prefer casting at the object level to stay faithful.
5. **No `window.*` globals for app code.** Replace any `window.API` with imported `API`. Guard real browser APIs (`localStorage`, `window.innerWidth`, `window.addEventListener`, `window.print`, `window.open`) with `typeof window !== 'undefined'` when used at module scope or in render; inside effects/handlers they're fine as-is.
6. **`window.__bzOpenDrawer`** (mobile hamburger) is set by the shell — leave `Topbar` usage as-is; it already handles it.
7. **Print windows** (`window.open` + `document.write`): keep verbatim inside handlers.
8. **Keep file-local helper consts/functions** that the prototype defines outside the component (move them into the same `.tsx`, they don't need exporting).
9. Default-export the page component; everything else stays unexported in the file unless another route needs it (then put the shared screen in `components/<name>.tsx` and import it from the page).

## Output location
- Routed screens: `app/(app)/<route>/page.tsx`
- Shared multi-route screens (Contacts for customers+suppliers, Finance for expenses+accounts): put the screen in `components/<name>-screen.tsx`, import into each `page.tsx`.
- Auth: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`.

Verify your file has no obvious syntax errors. Do not run the dev server (the orchestrator does that at the end).
