# Vertical Gap Register

*What each vertical is missing versus what a real operator (or a specialist
competitor) expects. Grounded in the current codebase. Priority tags:*
- 🔴 **day-one-critical** — a real operator in this vertical hits this in week one
- 🟡 **competitive** — a specialist has it; you'll lose deals without it
- ⚪ **elite** — category-leader differentiator
- ✅ **closed** — built + integration-tested since this register was written

> **Status:** every **vertical-specific 🔴** has been closed (accounting,
> delivery, pharmacy, HRM, wholesale, construction, lending, hotel, restaurant) —
> each built against the GL and covered by the integration suite (179 tests).
> The only 🔴s left are **cross-cutting** and need things the sandbox can't
> provide: **live mobile-money credentials** and the remaining **frontend
> breadth**.

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
- ✅ **Manual journal entry** — `POST /accounting/journal` posts balanced ad-hoc
  entries (validates codes + balance) with a screen wired to it.
- ✅ **AR aging report** — `GET /accounting/aging` buckets receivables 0–30/31–60/
  61–90/90+ by customer.
- 🟡 **Bank reconciliation** (+ bank feeds/CSV import).
- 🟡 Period close / ledger locking; cash-flow statement.
- 🟡 Fixed assets & depreciation; budgeting vs actual (exists for construction only).
- ⚪ Multi-currency consolidation; accountant/audit export packs; tax-return filing.

## Lending / Embedded finance — model complete, productization missing (~60% software)
- ✅ **KYC / identity capture + denylist + credit history** — disbursement is gated
  on verified KYC, a not-blacklisted ID, and no prior default.
- ✅ **Sharia-compliant late/default handling** — restructure (debt never grows) +
  a charity late-fee booked to Charity Payable (never lender income) + default flag.
- 🟡 Multiple concurrent advances policy; early-settlement rebate; rollover/restructure.
- 🟡 Borrower statements & schedule documents; guarantor capture.
- 🔴 *(non-software)* **Capital source + lending licence/partner** — the real gate.
- *(Built: ledger underwriting, Murabaha fixed fee, offer/disburse/repay/auto-collect,
  repayment-health.)*

---

## Restaurant — deep skin (~60%)
- ✅ **Modifiers + combos at the till** — modifier groups/options apply at item add;
  combos/set menus expand into apportioned component lines summing to the deal price.
- ✅ **Seat-level ordering + split bill by seat** — items carry a seat; split-by-seat
  produces one bill per seat (plus split-by-item, which already existed).
- 🟡 **Table floor-plan / map UI**; course firing / coursing to the kitchen.
- 🟡 Void/comp tracking with reasons; QR-menu / online ordering.
- 🟡 Tips pooling & distribution to staff.
- ⚪ Happy-hour/time-based pricing; menu-engineering reports; KDS hardware.
- *(Built: recipe/BOM depletion, service charge, waiter FK, 86 list, reservations,
  kitchen tickets, service types.)*

## Hotel / PMS — moderate skin (~55%)
- ✅ **Availability** — `GET /hotel/availability` returns per-room booked/free over a
  date range (overlap-aware); a visual board can render straight from it.
- ✅ **Rate plans / seasonal & dynamic pricing** — Best Available Rate resolver +
  `GET /hotel/quote`; reservations auto-apply the cheapest qualifying seasonal/
  long-stay plan.
- ✅ **Charge-to-room from POS/restaurant** — folio charges + restaurant post-to-folio
  post a meal to a guest folio.
- 🟡 **Housekeeping status board**; **night audit** routine.
- 🟡 Deposits & cancellation policies; guest profiles/history.
- ⚪ **Channel manager** (Booking.com/Expedia OTA sync) — the big one; occupancy/ADR/RevPAR.
- *(Built: room types/rooms, reservations, check-in/out, folios, room charges at
  check-in, tax/service, corporate accounts, group bookings.)*

## Pharmacy — deep skin (~60%)
- ✅ **Rx label** — `GET /pharmacy/prescriptions/:id/label` returns a structured +
  printable dispensing label (patient, drug, directions, prescriber, warnings).
- 🟡 **Insurance / third-party adjudication & claims** (cash-only today).
- 🟡 Allergy checking; full patient medication profile across visits (interaction
  check uses active Rx only).
- 🟡 Generic-substitution rules; refill reminders (WhatsApp).
- ⚪ E-prescribing / national Rx-system integration; controlled-substance returns to
  the authority.
- *(Built: prescriptions, controlled-substance 2-person verify, dispensing register,
  expiry/FIFO, drug-interaction checking, pack/unit selling.)*

## HRM / Payroll — moderate skin (~50%)
- ✅ **Payslip generation & distribution** — structured payslip endpoint + send over
  WhatsApp.
- ✅ **Statutory deductions & filing** — Kenya PAYE/NSSF/SHIF/Housing engine, preview,
  posted to a Statutory Payable account, with a per-month filing report (KRA/NSSF/SHA).
  Somaliland/Somalia return zero (no regime).
- 🟡 Overtime rules engine; employee self-service (view payslip/leave balance).
- 🟡 Contracts/documents; end-of-service gratuity.
- ⚪ Biometric/geofenced clock-in; performance; recruitment.
- *(Built: employees, org units, shifts, attendance (overnight/timezone-correct),
  leave accrual/balances, advances→GL, payroll→GL with advance recovery, todos.)*

## Construction — thin skin (~45–50%)
- ✅ **Change orders / variations** — raise/approve/reject; approval revises the budget
  and raises a billable milestone (debt-free until billed).
- ✅ **Material requisitions from inventory to a project** — issue stock at FIFO cost,
  relieve inventory (Dr COGS / Cr Inventory), roll into the project's material actuals.
- 🟡 **Subcontractor management & payments**; progress claims/valuations.
- 🟡 BOQ / estimating; certified payroll; snag/punch lists.
- ⚪ RFIs/submittals/drawings; scheduling/Gantt; equipment/plant tracking.
- *(Built: projects, budget lines, cost recording, labor log, site diary w/ photos,
  milestone billing → real AR + retention, tasks.)*

## Wholesale / Distribution — thin skin (~45%)
- ✅ **Backorders / partial fulfillment** — fulfil per-line quantities; short orders
  dispatch and bill only what shipped; the shortfall is a queryable backorder.
- ✅ **Credit notes / returns** — return against a delivered order; reverses revenue +
  receivable, re-states the order, caps at returnable.
- 🟡 **Van/route sales & mobile reps (DMS)** — Uzapoint has this; a real differentiator
  in the corridor.
- 🟡 Customer-specific catalogs/contract pricing; rep commissions per route.
- ⚪ Demand forecasting; EDI; territory management.
- *(Built: orders, pick/dispatch/deliver lifecycle, B2B price groups, credit/outstanding,
  overpayment cap, GL.)*

## Delivery / Marketplace — v1 foundation (~35%)
- ✅ **Zone-based delivery fee** — delivery zones with per-zone fees set server-side on
  order (both dispatch and public shop).
- ✅ **Customer status notifications** — WhatsApp on assigned/picked-up/delivered.
- ✅ **Proof of delivery** — recipient name + note + photo URL captured on delivered.
- 🟡 **Driver mobile view** (accept job, navigate, mark delivered) — currently
  operator-driven from the dispatch board.
- 🟡 Live driver GPS + map; ETA; driver earnings/payouts/**float** (the embedded-finance
  hook — COD already books driver-owes-AR).
- ⚪ Route optimization; ratings/reviews; scheduled deliveries; WhatsApp ordering bot.
- *(Built: driver pool, auto-dispatch, lifecycle, GL fee posting, public consumer
  storefront + order + tracking.)*

---

## How to use this register

1. **Every vertical's 🔴 row is now closed** — any vertical can onboard a first client
   on the software. What's left per vertical is 🟡 (competitive) and ⚪ (elite).
2. The remaining **🔴s are cross-cutting** and gated on the real world, not the code:
   - **Live mobile-money settlement** needs merchant credentials + each wallet's API
     (Daraja STK, Telebirr Fabric, Zaad/EVC USSD push). The GL, tender routing and
     provider registry are ready; only the live keys/integration remain.
   - **Frontend breadth** — wire the remaining CRUD screens to the live API and finish
     mobile-responsive passes.
   - *(non-software)* **Lending capital + licence/partner** — the real gate to
     disbursing money, independent of the software.
3. Next ranked work is therefore the cross-cutting 🔴s (they help *every* client),
   then per-vertical 🟡s for whichever vertical the first paying customer is in.
