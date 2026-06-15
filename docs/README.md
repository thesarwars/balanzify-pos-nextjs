# Balanzify POS — System README

> A multi-vertical, API-shaped Point-of-Sale platform for the **Somaliland · Somalia · Kenya · Ethiopia** retail market. Front-end is a high-fidelity, fully-interactive prototype that speaks an UltimatePOS-style `/connector/api/...` contract; the same screens run against a mock backend today and a real backend tomorrow with one toggle.

---

## 1. What this is

Balanzify POS is a SaaS retail/inventory/accounting suite. Every screen reads & writes through a **single API client** (`app/api.jsx`) exposing `window.API`. Today that client is backed by an **in-file mock store** (clickable, persists a sales ledger in `localStorage`); flip the API panel (bottom-left) to **Live** + set `API_CONFIG.baseUrl` and the entire app runs against a real server — **no screen code changes required**.

It is sold as a **core platform + paid add-on modules** (Restaurant, Hotel, Pharmacy, Construction, HRM, Superadmin/SaaS, Wholesale, AI Insights), each gated server-side.

---

## 2. Technology stack

### Front-end (this repo)
| Concern | Choice |
|---|---|
| Rendering | **React 18** (UMD, `ReactDOM.createRoot`) |
| Transpile | **Babel Standalone** (`type="text/babel"` script tags, in-browser JSX) |
| Language | Plain **JSX / ES2020** — no TypeScript, no build step |
| Styling | **Inline style objects** driven by a central theme token system (`app/theme.jsx`) — no CSS framework |
| State | React hooks (`useState`/`useEffect`/`useMemo`/`useRef`) — no Redux |
| Fonts | Google Fonts: **Fraunces** (display), **DM Sans** (body), **DM Mono** (mono) |
| Persistence | `localStorage` (mock ledger, tweaks, auth flag) |
| Charts/labels | Hand-rolled SVG/canvas (barcodes, QR placeholders) |

### Back-end (to be built — contract defined)
| Concern | Reference choice |
|---|---|
| Framework | Laravel (PHP) — UltimatePOS lineage; any stack that honours the contract works |
| DB | MySQL / MariaDB (multi-tenant, per-business scoping) |
| Auth | OAuth2 password grant (Laravel Passport) → Bearer tokens |
| API shape | REST, `/connector/api/...`, Laravel pagination envelope `{data, links, meta}` |
| Payments (SaaS) | Stripe + offline/manual approval |
| Integrations | SMS / Email / WhatsApp / Pusher, thermal printer, cash drawer, barcode scanner, weighing scale |

---

## 3. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (single-page, no build)                             │
│                                                              │
│  index → Balanzify POS Redesign.html                         │
│    ├─ React 18 + Babel Standalone (CDN)                      │
│    ├─ theme.jsx      → design tokens (makeTheme)             │
│    ├─ data.jsx/data2 → seed/reference data (mock)           │
│    ├─ api.jsx        → window.API  (mock ⇄ live transport)  │
│    ├─ kit.jsx        → shared UI primitives                 │
│    ├─ Shell.jsx      → Sidebar + Topbar chrome              │
│    └─ App.jsx        → router/switch + mounts <App/>        │
│                                                              │
│  Every feature screen (POS, Products, HRM, …) calls          │
│  API.<group>.<method>() — never fetch() directly.            │
└───────────────────────────┬──────────────────────────────────┘
                            │  transport(method, path, {query, body, auth})
                            │   mode:'mock' → in-file route table
                            │   mode:'live' → fetch(BASE_URL+path) + Bearer
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend (to build) — UltimatePOS-style /connector/api        │
│  OAuth2 · multi-tenant · MySQL · Stripe · notifications       │
└──────────────────────────────────────────────────────────────┘
```

### Request lifecycle
1. A component calls e.g. `API.product.list({ category_id })`.
2. `transport()` either routes to the in-file mock handler table (mock mode) or `fetch`es `BASE_URL + path` with an `Authorization: Bearer <token>` header (live mode).
3. **Adapters** (`adaptProduct`) normalise the verbose UltimatePOS product shape into a flat view-model.
4. The component renders from the view-model. Every call is recorded in an in-app **request log** (visible in the API panel).

---

## 4. Module map (feature → screen → endpoint group)

| Module | Screen file | Primary `API` group |
|---|---|---|
| Auth & registration | `Screens.jsx` (Login), `Register.jsx` | `auth`, `business` |
| Dashboard | `Dashboard.jsx` | `report`, derived |
| POS till | `POS.jsx` | `sell`, `register`, `heldSale`, `priceGroup`, `serviceType`, `reward` |
| Products | `Products.jsx`, `Labels.jsx`, `ImportExport.jsx` | `product`, `unit`, `brand`, `variation`, `taxRate`, `priceGroup` |
| Sales / Returns | `Screens.jsx` | `sell`, `sellReturn` |
| Contacts | `Contacts.jsx` | `contact`, `customerGroup` |
| Users & Roles | `UsersRoles.jsx` | `user`, `role`, `permissions` |
| Locations | `Locations.jsx` | `location`, `invoiceScheme`, `invoiceLayout`, `priceGroup`, `paymentMethod` |
| Purchases / Opening stock | `Purchases.jsx` | `purchase`, `openingStock` |
| Stock Transfer | `Transfers.jsx` | `transfer` |
| Orders (SO/PO) | `Orders.jsx` | `salesOrder`, `purchaseOrder` |
| Discounts | `Discounts.jsx` | `discount` |
| Invoice Layouts | `InvoiceLayouts.jsx` | `invoiceLayout` |
| Loyalty | `Loyalty.jsx` | `reward` |
| Finance (Expenses + Accounts) | `Finance.jsx` | `expense`, `paymentAccount` |
| Stock Adjustment + Tax Groups | `Adjustments.jsx` | `stockAdjustment`, `taxRate` |
| Reports (Commission, Register) | `DataScreen.jsx` | `report`, `register` |
| Plan & Modules | `DataScreen.jsx` | `module` |
| Restaurant add-on | `Restaurant.jsx` | `restaurant` |
| HRM add-on | `HRM.jsx` | `hrm` |
| Superadmin / SaaS | `Superadmin.jsx` | `superadmin` |
| Verticals (pharmacy etc.) | `Verticals.jsx` | derived |
| API request log panel | `ApiPanel.jsx` | `config` |

---

## 5. File architecture

```
Balanzify POS Redesign.html      ← entry; loads React+Babel then all app/*.jsx in order
app/
  theme.jsx       design tokens: ACCENTS, TYPE_PRESETS, SIDEBARS, makeTheme, money()
  data.jsx        seed: BUSINESS, CATEGORIES, PRODUCTS, CONTACTS, DASH, etc.
  data2.jsx       seed: STOCK_ROWS, STOCKTAKE, SCREENS config tables
  api.jsx         window.API — mock store, route table, transport, adapters, ledger replay
  kit.jsx         primitives: Btn, Badge, Panel, Modal, Field, TextField, SelectField,
                  StatCard, Trend, useToast, useViewport, FormGrid
  Shell.jsx       Sidebar (nav sections), Topbar, Login chrome
  App.jsx         screen switch + <App/> mount (dependency-gated mount poll)
  ApiPanel.jsx    floating Mock/Live toggle + request log
  Register.jsx    business registration wizard (4 steps)
  Dashboard.jsx   KPI dashboard
  POS.jsx         the till (grid, cart, payments, register, parked, service types)
  Products.jsx    catalog CRUD (single/variable/combo, managers)
  Labels.jsx      barcode label printing
  ImportExport.jsx CSV import/export
  Screens.jsx     Login, Sales history, Sell-return modal
  Contacts.jsx    customers/suppliers, ledger, customer groups
  UsersRoles.jsx  users + role permission matrix
  Loyalty.jsx     reward points settings + members
  Locations.jsx   business locations
  Purchases.jsx   purchases + opening stock
  Transfers.jsx   stock transfers
  Orders.jsx      sales orders + purchase orders
  Discounts.jsx   discount rules
  InvoiceLayouts.jsx receipt/invoice layout designer
  Finance.jsx     expenses + payment accounts
  Adjustments.jsx stock adjustments + tax groups
  DataScreen.jsx  generic data screens, Reports, Settings, Plan & Modules
  Verticals.jsx   vertical-specific screens
  Restaurant.jsx  tables/staff/modifiers/kitchen (add-on)
  HRM.jsx         employees/attendance/leave/payroll/shifts/advances (add-on)
  Superadmin.jsx  SaaS console: businesses/packages/payments/gateways (add-on)
docs/             ← this documentation set
```

### Script load order (critical)
`theme → data → data2 → api → kit → Shell → <feature screens> → App`. The entry HTML loads them as ordered `<script type="text/babel">` tags; `App.jsx` mounts only **after** its dependencies are defined (a small readiness poll guards the Babel async-load race).

---

## 6. Dependencies

| Dependency | How loaded | Purpose |
|---|---|---|
| react@18, react-dom@18 | CDN UMD `<script>` | rendering |
| @babel/standalone | CDN `<script>` | in-browser JSX transpile |
| Google Fonts (Fraunces, DM Sans, DM Mono) | `<link>` | typography |
| (none else) | — | zero npm build chain |

> The prototype intentionally has **no build step and no npm dependency tree** — it runs by opening one HTML file. A production rebuild would port the JSX to a Vite/Next pipeline and the mock `api.jsx` to a real backend.

---

## 7. Running

- **Mock mode (default):** open `Balanzify POS Redesign.html`. Login is prefilled (`amina@hodanmarket.so` / `demo1234`). A persistent sales ledger lives in `localStorage`.
- **Live mode:** open the bottom-left **API panel**, switch to **Live**, set the base URL. All `API.*` calls now hit the server.

---

## 8. Going live — build order

Auth → Products (+units/variations/brands/tax/price-groups) → Contacts (+groups) → Sell/Return → Users/Roles → Locations → Purchases/Opening-stock → Transfers → Orders → Discounts → Invoice layouts → Loyalty → Finance → Adjustments/Tax-groups → Modules/billing → Restaurant → HRM → Superadmin.

See `SCHEMA.md` for the data model and `EPICS.md` / `STORIES.md` for scope.
