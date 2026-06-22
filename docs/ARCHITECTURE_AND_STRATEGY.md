# Balanzify — Architecture & Africa-First Strategy

*The thesis, the architecture, and the moat — and an honest map of what is built
versus what remains. Written to be read by an operator, an engineer, or an
investor.*

---

## 1. The thesis

Balanzify is **one deep horizontal platform (a spine) with thin vertical skins**,
built to **dominate African markets** — Somaliland and Somalia first, then Kenya
and Ethiopia. It is not "a POS." It is the **operating system and the bank** for a
small business that may run a shop, a restaurant, a pharmacy, a hotel, a wholesale
depot and a construction job — often under one owner.

Two design commitments fall out of that:

1. **Don't compromise the 12 verticals, but don't fork 12 products.** Depth lives
   in a **shared spine**; breadth lives in **thin vertical configurations**. A
   hotel that only wants hotel management gets a focused skin; the spine underneath
   is the same one that powers everyone else. One business, **one set of books**
   across every vertical and location.

2. **The moat is finance, not features.** A POS that merely records sales is a
   commodity. A POS that **understands a business's cashflow well enough to lend to
   it** — interest-free, Sharia-compliant, collected automatically from daily
   takings — is something no incumbent offers in this market.

Everything below serves those two commitments.

---

## 2. The spine: a general ledger every vertical posts to

The center of the system is a **double-entry general ledger** (`backend/lib/accounting.js`).
Every money movement, in every vertical, posts a **balanced journal** to it. This
is what makes "one set of books" real and what makes underwriting possible.

**Chart of accounts** (seeded per business, idempotently backfilled):

| Code | Account | Notes |
|---|---|---|
| 1000 | Cash | |
| 1010 | **Mobile Money** | Zaad / EVC / M-Pesa / Telebirr routed here, not lumped into cash |
| 1020 | Bank / Card | |
| 1100 | Accounts Receivable | |
| 1110 | Employee Advances | salary advances are a receivable, not an expense |
| 1120 | Retention Receivable | construction retention held to handover |
| 1200 | Inventory | |
| 2000 | Accounts Payable | |
| 2100 | Tax Payable | |
| 2200 | Financing Payable | embedded-lending liability |
| 3000 | Owner's Equity | |
| 4000 | Sales Revenue | |
| 5000 | Cost of Goods Sold | |
| 5100 | Salaries & Wages | |
| 5200 | Operating Expenses | |
| 5300 | Financing Cost | |

Posting is **balanced by construction** — `postJournal` asserts debits == credits
and throws otherwise. Helpers exist for each money event: `postSale`,
`postFolioCharge`/`postFolioPayment` (hotel), `postPayroll`, `postAdvance`,
`postMilestoneBill`/`postMilestonePayment` (construction), `postExpense`.

From the journals, **financial statements derive directly**: trial balance,
income statement (P&L), and balance sheet — all live, all per-business, all
balanced.

**Why this matters strategically:** QuickBooks isn't in the till; Square can't see
your hotel and your shop on one P&L. Balanzify can, because the till *is* the
ledger.

---

## 3. The moat: embedded, Sharia-compliant lending

On top of the ledger sits the differentiator (`lib/underwriting.js`, `lib/financing.js`).

- **Underwriting from the ledger.** `assess()` scores a business 0–100 from real
  signals — average monthly revenue, net margin, cash on hand, payables, months
  active — and recommends a credit limit sized to its cashflow. No paperwork; the
  books *are* the application.
- **Sharia-compliant by construction.** Financing is a **fixed Murabaha-style fee**
  (e.g. 6% flat), disclosed up front. **No interest, no compounding, no penalties.**
  `totalRepayable = principal + fee`, and it never grows.
- **Auto-collection (the M-KOPA mechanic).** A configurable slice of each day's
  sales is skimmed toward the advance and **routed to the correct asset account by
  tender** (mobile-money collections credit 1010, not cash). Collection is
  self-throttling — quiet days collect less.
- **Repayment health** monitoring reports on_track / behind / at_risk.

This is the feature that turns a software subscription into a **financial
relationship** — and it is built, tested, and surfaced in the UI (`/lending`).

---

## 4. Africa-first capabilities (designed in, not bolted on)

| Capability | What it is | Module |
|---|---|---|
| **Mobile-money-native GL** | Zaad/EVC/M-Pesa/Telebirr are first-class tenders that route to their own ledger account | `lib/accounting.js` |
| **Offline-first sync** | Tills sell with the network down and reconcile later. Client-generated idempotency keys replay through the *same* `createSale` service → exactly-once + conflict detection for free. Delta pull for catalog/stock. | `routes/sync.js` |
| **WhatsApp-native comms** | Real delivery via a provider registry (Meta Cloud API / Twilio / wa.me fallback), with delivery status. Receipts + a **credit-reminder journey** tied to the financing loop. | `lib/whatsapp.js` |
| **Fiscalization** | Tax-authority compliance (Kenya eTIMS, Tanzania VFD, Rwanda EBM): every sale signed by a device into a **tamper-evident, genesis-chained** receipt, **offline-capable** (sign now, transmit when online), with a **public QR verify** endpoint. | `lib/fiscalization.js` |
| **Hijri calendar + Zakat** | Umm al-Qura conversion (EN/SO/AR), Ramadan awareness, and **Zakat computed straight from the ledger** at 2.5% above nisab — a feature no competitor offers. | `lib/hijri.js`, `lib/zakat.js` |
| **Localization + RTL** | Type-safe i18n (English/Somali/Arabic); Arabic drives right-to-left across the whole app. | `frontend/lib/i18n.ts` |

---

## 5. The 12 verticals — depth status

The spine is shared; each vertical is taken to **operator-grade** on top of it.

| Vertical | Depth highlights |
|---|---|
| **POS core** | Split tender (Σ = total enforced), server-recomputed coupons, capped refunds, FIFO costing, shifts, fraud-aware idempotency |
| **Restaurant** | Recipe/BOM ingredient depletion, in-process sale service, service charge, waiter/86/reservations as real records |
| **Hotel (PMS)** | Folio posts to GL at check-in, tax/service charge, booking safety, corporate accounts, group bookings |
| **Pharmacy** | Prescriptions, controlled-substance two-person verify, dispensing register, expiry/FIFO, **drug-interaction checking** (clinical safety) |
| **HRM/Payroll** | Payroll posts to GL, advance-as-receivable integrity, overnight-shift hours, leave accrual, EAT timezone |
| **Construction** | Milestone billing → real AR + retention, job costing, labor logs |
| **Wholesale** | Pick/dispatch/deliver lifecycle, overpayment cap, posts to GL |
| **Inventory** | FIFO cost layers, transfers, stocktake, purchase orders → GRN, GL postings |
| **Accounting** | Double-entry GL, trial balance, P&L, balance sheet |
| **Lending** | Underwriting + Sharia-compliant advances (the moat) |
| **Insights / Superadmin / Credit** | Cross-tenant console, diaspora credit pages |

---

## 6. Architecture at a glance

```
Next.js 14 (App Router, TS)                 Express + Prisma + PostgreSQL
┌─────────────────────────────┐             ┌──────────────────────────────┐
│  Screens (POS, verticals,    │   JWT       │  Routes  /api/v1/*           │
│  Zakat, Lending, Fiscal, …)  │  ───────▶   │  (auth, module-gated)        │
│                              │  realReq    │                              │
│  lib/api.ts  (typed client)  │             │  Services: accounting,       │
│  lib/i18n + LocaleProvider   │             │  underwriting, financing,    │
│  (EN/SO/AR, RTL)             │             │  fiscalization, whatsapp,    │
└─────────────────────────────┘             │  hijri, zakat, druginteract  │
                                            │            │                 │
                                            │            ▼                 │
                                            │  GENERAL LEDGER (spine)      │
                                            │  every vertical posts here   │
                                            └──────────────────────────────┘
```

- **Multi-tenant** with `businessId` isolation and modular SaaS gating
  (`enabledModules` / `requireModule`) — verticals are licensed add-ons.
- **Pluggable registries** for payments, WhatsApp providers, and fiscal
  jurisdictions — new providers/countries are config, not forks.
- **Quality posture:** an integration suite runs every route against a real
  Postgres. Current state: **156/156 green and idempotent across reruns.**

---

## 7. Competitive position (honest)

**Where Balanzify leads** — and no incumbent matches the *combination*:
- One ledger under all 12 verticals **+ embedded, Sharia-compliant, cashflow-underwritten lending**.
- **Zakat from the ledger** — category-defining for the target customer.
- **Fiscalization** architected once, offline-capable, with public verification.
- Mobile-money-native, WhatsApp-native, Hijri/RTL — Africa-native rails.

**Where Balanzify is at parity:** accounting depth (~70% of QuickBooks/Xero),
operator-grade vertical backends, exactly-once offline sync contract.

**Where Balanzify still lags — and it is mostly *not* backend:**
1. **Frontend reality** — the UI is a strong prototype still largely on a mock API;
   the localization spine, typed clients, and five live capability screens are in,
   but the ~40 CRUD screens aren't all wired to the live backend yet.
2. **Hardware** — elite POS are hardware companies; Balanzify emits ESC/POS only.
3. **Offline client** — the server contract exists; the IndexedDB/service-worker
   client does not.
4. **Ecosystem & deployment** — no live multi-tenant deployment, integrations
   marketplace, or mobile apps yet.

**Verdict:** the *category-defining* thesis is **architecturally proven and
de-risked** — the hard, defensible parts (spine, moat, compliance, Africa-native
rails) are built and tested. The distance to *dominating* is **execution surface**
(wire the UI, build the offline client, certify hardware, deploy), not unproven
architecture.

---

## 8. Roadmap (what remains, in leverage order)

1. **Wire the existing UI to the live backend**, screen by screen (the single
   biggest gap to a shippable product).
2. **Offline client** — IndexedDB outbox + service worker against `/sync`.
3. **Hardware** — certify the common in-market printers, drawers, scanners.
4. **Per-country fiscal transmit adapters** — live eTIMS/VFD/EBM submission on top
   of the existing signing spine.
5. **Deployment & GTM** — multi-tenant hosting, onboarding, pricing, support.

The architecture was built so that each of these is **additive**, not a rewrite.
