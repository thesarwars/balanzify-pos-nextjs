# Vertical Gap Register

*What each vertical is missing versus what a real operator (or a specialist
competitor) expects. Grounded in the current codebase. Priority tags:*
- 🔴 **day-one-critical** — a real operator in this vertical hits this in week one
- 🟡 **competitive** — a specialist has it; you'll lose deals without it
- ⚪ **elite** — category-leader differentiator

---

## Cross-cutting (affects every vertical — fix once, helps all)

- 🔴 **Live mobile-money settlement.** The GL routes Zaad/EVC/M-Pesa/Telebirr and a
  provider registry exists, but **no wallet's live API is wired** — needs merchant
  credentials + per-wallet integration (USSD push / STK / Daraja / Fabric).
- 🔴 **Frontend breadth.** ~40 CRUD screens aren't all wired to live data; only the
  core loop + capability screens are. Mobile-responsive passes still needed.
- 🟡 **Live fiscalization transmission.** Signing/QR/chain is built; per-country
  *submission* (eTIMS/VFD/EBM API) is not.
- 🟡 **Reporting/BI depth & per-vertical dashboards** (occupancy, menu mix, etc.).
- 🟡 **Notifications engine** (low-stock, due payments, status changes → WhatsApp/SMS).
- ⚪ **Hardware** (printers/drawers/scanners/KDS) — deliberately out of scope.
- ⚪ **Granular role permissions**, full audit trail UI, multi-currency operations.

---

## POS core / Retail — deepest skin (~65%)
- 🟡 Gift cards & store credit; layaway/instalment holds.
- 🟡 Returns/exchange **without a receipt** (lookup by customer/date).
- 🟡 Weight/scale items; quick-keys & modifier buttons at the till.
- 🟡 Surcharge / cash-discount / rounding rules (configurable).
- ⚪ Customer-facing display polish; AI upsell at the till.
- *(Built: split tender, server-recomputed coupons, capped refunds, FIFO, shifts,
  fraud-aware idempotency, offline-first, loyalty earn+redeem, tax engine,
  mobile-money routing, service/packing charge, held sales, multi-format receipts.)*

## Inventory — shared, deep (~60–65%)
- 🟡 **Auto-replenishment / suggested-PO generation** (reorder *suggestions* exist;
  one-click PO from them doesn't).
- 🟡 Landed cost (freight/duty into unit cost); stock valuation report.
- 🟡 Cycle-counting workflow (vs full stocktake only).
- ⚪ Demand forecasting; barcode-label print jobs to hardware.
- *(Built: FIFO cost layers, batches/expiry, transfers, stocktake/variance, PO→GRN,
  serials, variants, bundles, multi-location, adjustments, supplier catalog.)*

## Accounting / GL — the spine (~65% of QuickBooks/Xero)
- 🔴 **Manual journal entry UI** (engine posts automatically; an accountant needs to
  post adjustments/corrections by hand).
- 🔴 **AR/AP aging reports** (data is there; the report isn't surfaced).
- 🟡 **Bank reconciliation** (+ bank feeds/CSV import).
- 🟡 Period close / ledger locking; cash-flow statement.
- 🟡 Fixed assets & depreciation; budgeting vs actual (exists for construction only).
- ⚪ Multi-currency consolidation; accountant/audit export packs; tax-return filing.

## Lending / Embedded finance — model complete, productization missing (~60% software)
- 🔴 **KYC / identity capture** + blacklist/credit-history check before disbursing.
- 🔴 **Sharia-compliant late/default handling** (no riba penalty — model a charity
  late-fee or restructuring, not interest).
- 🟡 Multiple concurrent advances policy; early-settlement rebate; rollover/restructure.
- 🟡 Borrower statements & schedule documents; guarantor capture.
- 🔴 *(non-software)* **Capital source + lending licence/partner** — the real gate.
- *(Built: ledger underwriting, Murabaha fixed fee, offer/disburse/repay/auto-collect,
  repayment-health.)*

---

## Restaurant — deep skin (~60%)
- 🔴 **Modifiers / combos at the till** (no salt, extra cheese, set menus).
- 🔴 **Seat-level ordering + split bill by seat/item** (split tender exists; per-seat
  doesn't).
- 🟡 **Table floor-plan / map UI**; course firing / coursing to the kitchen.
- 🟡 Void/comp tracking with reasons; QR-menu / online ordering.
- 🟡 Tips pooling & distribution to staff.
- ⚪ Happy-hour/time-based pricing; menu-engineering reports; KDS hardware.
- *(Built: recipe/BOM depletion, service charge, waiter FK, 86 list, reservations,
  kitchen tickets, service types.)*

## Hotel / PMS — moderate skin (~55%)
- 🔴 **Availability calendar + overbooking rules** (booking safety exists; a visual
  availability board doesn't).
- 🔴 **Rate plans / seasonal & dynamic pricing** (flat rates only today).
- 🔴 **Charge-to-room from POS/restaurant** (post a meal to a guest folio).
- 🟡 **Housekeeping status board**; **night audit** routine.
- 🟡 Deposits & cancellation policies; guest profiles/history.
- ⚪ **Channel manager** (Booking.com/Expedia OTA sync) — the big one; occupancy/ADR/RevPAR.
- *(Built: room types/rooms, reservations, check-in/out, folios, room charges at
  check-in, tax/service, corporate accounts, group bookings.)*

## Pharmacy — deep skin (~60%)
- 🔴 **Rx label printing** (dispensing legally needs a patient label).
- 🟡 **Insurance / third-party adjudication & claims** (cash-only today).
- 🟡 Allergy checking; full patient medication profile across visits (interaction
  check uses active Rx only).
- 🟡 Generic-substitution rules; refill reminders (WhatsApp).
- ⚪ E-prescribing / national Rx-system integration; controlled-substance returns to
  the authority.
- *(Built: prescriptions, controlled-substance 2-person verify, dispensing register,
  expiry/FIFO, drug-interaction checking, pack/unit selling.)*

## HRM / Payroll — moderate skin (~50%)
- 🔴 **Payslip generation & distribution** (payroll computes + posts to GL; the
  employee-facing payslip artifact is thin).
- 🔴 **Statutory deductions & filing** per country (Kenya PAYE/NSSF/SHIF; minimal in
  Somalia) — a Kenyan payroll is non-compliant without this.
- 🟡 Overtime rules engine; employee self-service (view payslip/leave balance).
- 🟡 Contracts/documents; end-of-service gratuity.
- ⚪ Biometric/geofenced clock-in; performance; recruitment.
- *(Built: employees, org units, shifts, attendance (overnight/timezone-correct),
  leave accrual/balances, advances→GL, payroll→GL with advance recovery, todos.)*

## Construction — thin skin (~45–50%)
- 🔴 **Change orders / variations** (a job without change-order tracking loses money).
- 🔴 **Material requisitions from inventory to a project** (link stock issue → job cost).
- 🟡 **Subcontractor management & payments**; progress claims/valuations.
- 🟡 BOQ / estimating; certified payroll; snag/punch lists.
- ⚪ RFIs/submittals/drawings; scheduling/Gantt; equipment/plant tracking.
- *(Built: projects, budget lines, cost recording, labor log, site diary w/ photos,
  milestone billing → real AR + retention, tasks.)*

## Wholesale / Distribution — thin skin (~45%)
- 🔴 **Backorders / partial fulfillment** (B2B orders are rarely fully in stock).
- 🔴 **Credit notes / returns workflow** (distribution runs on returns).
- 🟡 **Van/route sales & mobile reps (DMS)** — Uzapoint has this; a real differentiator
  in the corridor.
- 🟡 Customer-specific catalogs/contract pricing; rep commissions per route.
- ⚪ Demand forecasting; EDI; territory management.
- *(Built: orders, pick/dispatch/deliver lifecycle, B2B price groups, credit/outstanding,
  overpayment cap, GL.)*

## Delivery / Marketplace — v1 foundation (~35%)
- 🔴 **Distance-based delivery fee** (flat/zero today — needs zones or distance).
- 🔴 **Customer status notifications** (WhatsApp on assigned/picked-up/delivered).
- 🔴 **Proof of delivery** (photo/signature/OTP).
- 🟡 **Driver mobile view** (accept job, navigate, mark delivered) — currently
  operator-driven from the dispatch board.
- 🟡 Live driver GPS + map; ETA; driver earnings/payouts/**float** (the embedded-finance
  hook — COD already books driver-owes-AR).
- ⚪ Route optimization; ratings/reviews; scheduled deliveries; WhatsApp ordering bot.
- *(Built: driver pool, auto-dispatch, lifecycle, GL fee posting, public consumer
  storefront + order + tracking.)*

---

## How to use this register

1. **Pick the first-client vertical, then close only its 🔴 row** before onboarding —
   typically 1–3 weeks of work per vertical.
2. The **cross-cutting 🔴s** (live mobile money, frontend breadth) help *every* client,
   so they rank above any single vertical's 🟡/⚪.
3. **Retail, Restaurant, Pharmacy** have the fewest 🔴s → fastest to a happy first
   customer. **Hotel, Construction, Wholesale, Delivery** have more → land those only
   if the client is worth the deepening.
