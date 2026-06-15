# Balanzify POS — Component & UI Prompt Spec (`prompt.md`)

A reproducible, component-wise specification: design tokens, CSS conventions, every shared primitive, each screen's components, modals, and windows. Use this to rebuild or extend any part of the UI faithfully.

---

## 1. Design language

**"The Ledger, evolved."** Warm-paper surfaces, deep-navy ink, brass trust accent. Calm depth, tight type, tokens used everywhere. Regional context: East-African retail (USD/SOS/KES/ETB, Zaad/EVC mobile money, names like Amina/Bashir/Hodan Market).

---

## 2. Color palette (from `app/theme.jsx`)

### Accent presets (Tweak-swappable; **brass** is canonical)
| Key | base | bright | soft | text | on |
|---|---|---|---|---|---|
| brass | `#A16207` | `#C8881A` | `#F4EAD6` | `#7A4A06` | `#FFFFFF` |
| emerald | `#0F766E` | `#14938A` | `#D7F0EC` | `#0B5750` | `#FFFFFF` |
| indigo | `#4338CA` | `#5B50E0` | `#E4E2FB` | `#322B9E` | `#FFFFFF` |

### Core tokens
| Token | Value | Use |
|---|---|---|
| navy / navyMid / navyLight | `#0B1730` / `#13294D` / `#1B3A6B` | brand rails, primary buttons, bank cards |
| paper / paperAlt / paperSink / card | `#FFFDF9` / `#F6F3EE` / `#EFEAE0` / `#FFFDF9` | surfaces |
| ink / inkMid / inkSub / inkMute | `#1A1611` / `#3E3729` / `#7A7264` / `#A89F8E` | text hierarchy |
| line / lineMid | `#EAE3D6` / `#D9CFBC` | borders |
| green / greenSoft / greenText | `#0E9F6E` / `#D8F3E6` / `#066043` | success, in-stock, paid |
| amber / amberSoft / amberText | `#D97706` / `#FCEFD3` / `#8A4B08` | warning, low-stock, pending |
| red / redSoft / redText | `#DC2626` / `#FBE3E1` / `#961717` | danger, out-of-stock, refund |
| blue / blueSoft / blueText | `#2563EB` / `#DEE9FD` / `#1A45B0` | info, in-transit |
| violet / violetSoft | `#7C3AED` / `#ECE3FE` | add-on badges, drafts |

### Sidebar tones (light or dark grounds, full token sets)
`linen #FBF9F4` · `sand #F0E7D5` · `mist #EEF1ED` · `espresso #211910 (dark)` · `navy #0B1730 (dark)`.

---

## 3. Typography

| Preset | Display | Body | Mono | dispWeight / track |
|---|---|---|---|---|
| ledger (default) | Fraunces serif | DM Sans | DM Mono | 600 / -0.5px |
| grotesk | Space Grotesk | DM Sans | DM Mono | 600 / -1px |
| editorial | Fraunces | Newsreader | DM Mono | 500 / -0.4px |

Scale conventions: page titles `fDisplay` 22–28px; section labels 10–11px uppercase 0.5–1px tracked `inkSub`; body 12.5–14px; mono for money/SKU/IDs/times. Money uses `fMono`, two decimals, `en-US` grouping.

---

## 4. Shape, depth, motion

| Token | Value |
|---|---|
| radius r / rLg / rXl / rFull | 10 / 14 / 18 / 999 |
| sh1 (cards) | `0 1px 2px rgba(60,45,20,.05), 0 1px 3px rgba(60,45,20,.04)` |
| sh2 | `0 2px 4px …, 0 6px 16px rgba(60,45,20,.06)` |
| sh3 | `0 8px 18px …, 0 18px 40px rgba(40,30,12,.10)` |
| shModal | `0 28px 70px rgba(20,15,5,.28)` |

Motion: 120–220ms ease; modals `sheetUp .22s cubic-bezier(.2,.7,.3,1)`; drawers `slideLeft .22s`; toggles 180ms.

---

## 5. CSS conventions

- **Inline style objects only** — no stylesheets, no class CSS. Every element styled via `style={{…}}` reading theme tokens `T.*`.
- **Theme injection:** `const T = makeTheme({accent, type, sidebar})` produced in `App.jsx`, threaded as `T` prop to every component.
- **Layout:** `display:flex`/`grid` with `gap`; never inline-flow spacing. Tables use `borderCollapse:collapse`; rows `borderBottom: 1px solid T.line`.
- **Responsive:** `useViewport()` → `{w, isMobile (<860), isTablet}`. Sidebar collapses to a drawer, POS cart to a bottom sheet, modals to `min(width, 96vw)`, multi-col grids to single column under breakpoints.
- **Money:** `money(n)` / `money0(n)`; `moneyParts()` for typographic emphasis.
- **Currency/region:** `$` default; symbols for USD/SOS/KES/ETB/AED/EUR/GBP.

---

## 6. Shared primitives (`app/kit.jsx`)

| Component | Props | Notes |
|---|---|---|
| `Btn` | `T, kind('accent'|'primary'|'ghost'|'danger'), onClick, disabled, style` | accent=brass gradient/solid, primary=navy gradient, ghost=outline, danger=red soft |
| `Badge` | `T, tone('green'|'amber'|'red'|'blue'|'violet'|'gray'|'brass')` | pill status chip |
| `Trend` | `T, value` | up/down delta |
| `StatCard` / `MiniStat` | `T, label, value, tone` | KPI tiles |
| `Panel` | `T, title, subtitle, pad, right, children` | card container; `pad={false}` for tables |
| `Modal` | `T, title, subtitle, width, onClose, footer, onSave, saveLabel, children` | centered; `width→min(width,96vw)`; `sheetUp` anim; footer wraps |
| `Field` | `T, label, hint, required, error, full, children` | form field wrapper |
| `TextField` | `T, value, onChange, type, placeholder` | text/number/date/time input |
| `SelectField` | `T, value, options[], onChange, render` | styled select |
| `FormGrid` | `cols`, children | auto-fit responsive form grid |
| `useToast()` | → `[show(msg), node]` | transient toast |
| `useViewport()` | → `{w,isMobile,isTablet}` | responsive hook |
| `methodTone`, `swatchBg` | helpers | payment-method colour, product swatch gradient |

---

## 7. Chrome (`app/Shell.jsx`)

- **Sidebar** — sectioned nav (Inventory, Finance, Operations, …); collapsible (68px ↔ 244px) on desktop, off-canvas drawer on mobile with dimmed backdrop; brand mark, active rail, user footer. Tokenised via `T.side.*`.
- **Topbar** — `Topbar({T,title,subtitle,right})`; hamburger on mobile (`window.__bzOpenDrawer`); right-slot holds page actions (+ Export/Print where applicable).
- **Login** — split brand panel + form; prefilled demo creds; "Register business" link → wizard.

---

## 8. Component & modal inventory by screen

> Convention: **Screen** = full route view; **Modal** = centered overlay; **Drawer/Window** = side panel or new browser window (print).

### POS (`POS.jsx`)
- Components: category rail, search, **product Tile** (card) + **product Row** (list) — both show **available stock = on-hand − in-cart** (green/amber/red, "Out"), cart-qty badge; cart/order panel (rail / bottom-sheet / panel modes via tweaks); totals; Charge button.
- Live behaviours: adding to cart reserves stock visually (display-only); `beforeunload` warns of unsaved cart on refresh.
- Modals/windows: **Payment** (quick / split-tender with change & credit, express cash), **Variation picker**, **Customer picker**, **Parked orders** (suspend/draft/quote), **Register** (open/details/close+reconcile). Top-bar selectors: register status, price-group, type-of-service (Restaurant module).

### Products (`Products.jsx`, `Labels.jsx`, `ImportExport.jsx`)
- Screen: filterable table (Product, SKU, Category, Price, Margin, Stock badge), low-stock filter, category chips.
- Drawer: **product detail** (full-screen on mobile) with Edit / Duplicate / Delete + variation/stock breakdown.
- Modals/managers: **Add/Edit Product** (single/variable/combo, units, tax, alert qty, opening stock, variations grid, combo builder, image swatch), **Units**, **Brands**, **Variations**, **Price Groups**, **Import/Export** (CSV template, paste/upload, per-row validation), **Print Labels** (barcode sheet → print window).

### Registration (`Register.jsx`)
- 4-step wizard window: Business → Tax → Admin user → Review; reads currencies/timezones; disposable-email + uniqueness validation; success → Login (prefilled username).

### Contacts (`Contacts.jsx`)
- Screen: customers/suppliers tabs, table. Drawer: **contact ledger** (full-screen mobile). Modals: **Add/Edit Contact**, **Payment (receive/pay)**, **Customer Groups**.

### Users & Roles (`UsersRoles.jsx`)
- Tabs: Users, Roles. Modals: **Add/Edit User** (location access, max discount, commission %), **Add/Edit Role** (grouped permission matrix).

### Locations / Purchases / Transfers / Orders / Discounts
- Each: list/table screen + create/edit modal. Transfers & Orders have **status flows** (pending/in-transit/completed; ordered/partial/completed) with action buttons; Orders **convert** to purchase/sale.

### Finance (`Finance.jsx`)
- Tabs: Expenses (table + **Add Expense** modal, category adder, account draw-down, refund), Payment Accounts (cash/bank/mobile cards, **Deposit**, **Transfer** modals).

### Adjustments (`Adjustments.jsx`)
- Screen: stock-adjustment table; **New Adjustment** modal (normal/abnormal, reason, lines → reduces stock); **Tax Groups** manager (combine rates).

### Invoice Layouts (`InvoiceLayouts.jsx`)
- Split editor + **live receipt preview** (classic/elegant/slim-80mm); toggles (address, tax summary, total-in-words, discount, QR, letterhead, gift-receipt). Print window.

### Reports / Settings / Plan & Modules (`DataScreen.jsx`)
- Reports tabs: Overview, Sales Representative (commission), **Cash Register** report. Settings: business/tax/payment toggles. **Plan & Modules**: add-on cards with per-module pricing + live plan total; toggles gate features.

### Restaurant add-on (`Restaurant.jsx`)
- Locked state until module enabled. Tabs: **Tables** (free/occupied grid), **Service Staff** (PIN), **Modifiers** (sets+priced options), **Kitchen** (live KOT tickets, ready→served).

### HRM add-on (`HRM.jsx`)
- Locked state until enabled. Tabs: Overview, **Employees** (row→profile **drawer** with avatar, sales/commission, payroll+payslip, attendance, leave, advances), **Departments** (dept/designation managers), **Attendance** (clock in/out/break cards, grace, flexible shifts, running hours, **Attendance Settings** modal), **Report** (monthly + auto-absent), **Shifts** (roster + **swap requests**), **Leave** (dynamic admin-defined types, per-employee overrides, balances/accrual, approver column, **Leave Types** manager), **Payroll** (overtime/bonus/incentive/deductions, **Payslip Settings**, **payslip** print window), **Advances** (loans drawn from accounts, recovered via payroll), **Tasks**. Every data tab has **search + department + status filters** and **Export (CSV) / Print** buttons.

### Superadmin / SaaS add-on (`Superadmin.jsx`)
- Locked until enabled. Dashboard (businesses, active/trial/expired, MRR) + tabs: **Businesses** (activate/deactivate/login-as), **Packages** (create/remove plans), **Payments** (approve offline), **Gateways** (Offline/Stripe toggles).

### API Panel (`ApiPanel.jsx`)
- Floating **Mock ⇄ Live** toggle, base-URL field, **request log** (method/path/status/latency). Branded "Balanzify POS".

---

## 9. Key functions / hooks reference

| Function | File | Role |
|---|---|---|
| `makeTheme({accent,type,sidebar})` | theme.jsx | builds the `T` token object |
| `money / money0 / moneyParts / timeAgo` | theme.jsx | formatting |
| `transport(method, path, {query,body,auth})` | api.jsx | mock⇄live request core |
| `route(method, path, handler)` | api.jsx | registers a mock endpoint |
| `adaptProduct()` | api.jsx | UltimatePOS→flat view-model |
| `replayLedger()` | api.jsx | restores stock/sales from localStorage ledger at boot |
| `moduleOn(key)` | api.jsx | server-side add-on gating |
| `useTweaks(defaults)` | tweaks-panel.jsx | tweak state/persistence |
| `useToast / useViewport` | kit.jsx | toasts, responsive |
| `attendanceSummary / leaveBalance / buildPayslip / employeeProfile` | api.jsx | HRM derivations |

---

## 10. Tweakable props (host Tweaks overlay)

Accent (brass/emerald/indigo), type preset (ledger/grotesk/editorial), sidebar tone (linen/sand/mist/espresso/navy), POS till theme (light/dark), POS grid (cards/list/category-first), POS cart layout (rail/sheet/panel).
