# Balanzify POS — Gap-to-Elite Roadmap

*A module-by-module specification of exactly what each module needs to rival the category-leading product in its vertical.*

## How to read this

Each module is benchmarked against the **elite** product(s) in its category, then the gap is broken into three tiers:

- **T1 — Parity (table stakes):** without these you are not taken seriously by a real operator. Mostly correctness and compliance.
- **T2 — Competitive (daily driver):** the features that make the leader's customers stay. Match these and you can win deals on price/locale.
- **T3 — Leadership (where Balanzify can beat them):** capabilities the incumbents *don't* have, enabled by Balanzify's multi-vertical + mobile-money + AI + emerging-market position.

Current maturity is expressed as a rough % of category-leader depth, grounded in the code audits.

A blunt strategic point up front: **you cannot take all 12 verticals to elite.** Elite products are narrow and bulletproof. The winning play is (1) fix the cross-cutting foundations below, (2) pick **2 verticals** to take to true depth, and (3) keep the rest at solid parity. The foundations are what actually separate "ambitious" from "elite."

---

## 0. Cross-cutting foundations (the real moat)

These are not features — they are the substrate every module sits on. The elite products win here, and Balanzify currently has none of them. **This is the highest-leverage investment.**

### 0.1 Offline-first / local-first sync — *the single most important gap for the target market*
Square and Toast keep selling when the internet drops, then reconcile. Balanzify is online-only with in-process `Map` caches that assume one instance.
- **T1:** Client-side durable queue — sales, payments, stock decrements captured locally and replayed on reconnect; deterministic server-side idempotency (already partially built via cart fingerprints) so replays don't double-post.
- **T2:** Local-first data model (IndexedDB/SQLite-WASM) with background sync; conflict resolution (last-write-wins per field or CRDT for counters like stock); offline receipt printing.
- **T3:** Multi-device LAN sync (one store, several tills, no cloud) — critical where connectivity is intermittent. No global leader nails this for emerging markets.

### 0.2 Hardware ecosystem
Elite POS are hardware companies. Balanzify emits ESC/POS strings but has no device story.
- **T1:** Certified support for the 3–4 most common receipt printers, cash drawers, and barcode scanners in-market; printer/drawer kick via WebUSB/WebSerial or a thin local agent.
- **T2:** EMV card terminals, kitchen display screens (KDS), customer-facing displays, weighing scales, label printers.
- **T3:** A reference hardware bundle (Android-based all-in-one) sold with the software.

### 0.3 Fiscal / regulatory compliance
Increasingly mandatory in African markets (Kenya KRA eTIMS, Tanzania VFD/EFD, Rwanda EBM, Nigeria FIRS e-invoicing, etc.).
- **T1:** Fiscal device / e-invoice integration per target country; immutable sale signing; tax authority reporting.
- **T2:** Pharmacy regulatory reporting, payroll statutory filing, AML/KYC where credit is offered.
- **T3:** A compliance layer abstracted per-jurisdiction so new countries are config, not code.

### 0.4 Multi-tenant correctness & reliability
- **T1:** Enforce tenant isolation in one place — Prisma extension that injects `businessId` into every query (the audits found real cross-tenant IDORs). Money in integer minor units or `Decimal`. Row-locked ledgers. Move provider charges out of serializable transactions.
- **T2:** Multi-instance safe (Redis-backed caches/state, not per-process `Map`s); horizontal scale; observability (the Prometheus/Grafana scaffolding exists — wire SLOs).
- **T3:** Multi-region, active-active, regional data residency.

### 0.5 Open platform & integrations
- **T1:** Stable public REST API (the `/api/v1` contract is already coherent), webhooks (signed, idempotent), accounting export.
- **T2:** Certified connectors (QuickBooks/Xero, e-commerce, payroll), Zapier/Make.
- **T3:** App marketplace + developer platform — turn the product into a platform.

---

## 1. POS Core — vs **Square, Toast**

**Current maturity: ~45%.** Strong surface (split tender, refunds, shifts, held sales) and genuinely sophisticated idempotency/fraud detection. Held back by float money math, provider-in-transaction, no offline, and the audited trust-the-client gaps (coupon/tender/refund).

- **T1 Parity:** offline sale capture (§0.1); enforce `Σ tenders == total`; server-recompute coupons; refund through the provider, capped by sold−refunded; barcode-scan-to-cart; cash-drawer/printer kick; blind cash-up with variance; tax-inclusive correctness on discounted base.
- **T2 Competitive:** quick-keys/favorites & modifiers at till; weight/scale items; returns-without-receipt via lookup; gift cards & store credit at POS; surcharge/cash-discount rules; layaway; tip flows; customer-facing display (move off in-memory `Map`); multi-station single order.
- **T3 Leadership:** **mobile-money native QR with auto-reconciliation** (no leader does this well); offline mobile-money vouchers; AI upsell at the till; a **unified cross-vertical cart** — ring a hotel night + a restaurant meal + a retail item on one tender. No incumbent can do this because none span the verticals.

---

## 2. Payments — vs **Stripe / Adyen + Square**

**Current maturity: ~40%.** Clean pluggable provider registry (a real strength). Weak on webhook security, refunds, settlement, and card-present.

- **T1 Parity:** authenticate + business-scope all webhooks (audited as forgeable); idempotent webhook processing; refunds wired to `provider.refund()`; per-currency rounding rules (the M-Pesa `Math.ceil` over-charges); settlement/reconciliation reports; never store PAN (tokenize).
- **T2 Competitive:** EMV card-present terminals; saved cards/tokens; partial capture/auth; payout & settlement ledger; chargeback/dispute handling; smart retries/dunning.
- **T3 Leadership:** a **single API over all African mobile-money rails** with smart routing & auto-reconcile; offline mobile-money; instant-settlement working-capital financing on top of transaction flow.

---

## 3. Inventory — vs **Lightspeed, Cin7, Unleashed**

**Current maturity: ~35%.** Broad surface (batches, transfers, PO/GRN, reorder) but the audit found **FIFO is dead code**, transfers create/destroy stock via silent clamps, and supplier balances double-count.

- **T1 Parity:** create `CostLayer` on GRN so FIFO actually runs; one atomic `applyStockMovement()` helper (computes running balance, forbids negative-from-nothing); accurate COGS; reject over-transfers; supplier balance by received value (not full PO) once; 3-way match (PO ↔ GRN ↔ bill).
- **T2 Competitive:** reorder by velocity + lead time + safety stock, **net of in-flight POs**, per location, respecting MOQ; FEFO for perishables; landed cost (freight/duty allocation); kits/BOM/assembly; cycle counts + full stocktake variance posting (currently unreachable); supplier price lists; label/barcode printing.
- **T3 Leadership:** AI demand forecasting; auto-PO generation; cross-location auto-balancing; expiry-driven dynamic markdown; shrinkage analytics.

---

## 4. Pharmacy — vs **PioneerRx, PrimeRx, McKesson EnterpriseRx**

**Current maturity: ~25%.** Currently a read/advisory layer on a generic POS. The vertical is *defined* by regulatory depth Balanzify doesn't have yet — this is the biggest gap-to-elite of any module.

- **T1 Parity (regulatory table stakes):** a real **prescription model** (prescriber, patient, drug, sig, qty, refills, DAW); dispensing log + Rx label printing; **controlled-substance register** (schedule, running balance, perpetual inventory, two-person verification); pack/unit dispensing inventory model (partial packs); FEFO/expiry enforcement on the actual sale; batch recall.
- **T2 Competitive:** drug master data (generic/brand, strength, form, NDC/ATC); **interaction + allergy + dose-range checking**; patient profiles & medication history; refill reminders; prescriber database; insurance/claims adjudication where applicable.
- **T3 Leadership:** telepharmacy; adherence programs; AI substitution & therapy review; chronic-care refill automation; a shared pan-African drug registry across all Balanzify pharmacies.

---

## 5. Hotel / PMS — vs **Mews, Cloudbeds, Oracle Opera**

**Current maturity: ~30%.** Best surface of the verticals (folios, groups, housekeeping) but the audit found **room charges are never posted** — folios stay empty and checkout balances are always zero. The engine exists; the heartbeat is missing.

- **T1 Parity:** **night-audit job** posting `room_night` charges nightly (honor `autoPostRoomCharges`); working folio balance + checkout enforcement; carry deposits into the folio at check-in; rate plans + seasonal rates; concurrency-safe availability (no double-booking); tax/service-charge automation on folio close; housekeeping status; guest profiles.
- **T2 Competitive:** **channel manager / OTA two-way sync** (Booking.com/Expedia/Airbnb — `bookingSource` already anticipates it); online booking engine; revenue management (dynamic pricing); group blocks + master/split billing done correctly; city-ledger/corporate AR; registration card + ID capture; ADR/RevPAR/occupancy reporting; POS-to-room posting with tax (restaurant→folio exists, needs tax).
- **T3 Leadership:** AI dynamic pricing & upsell; contactless/keyless check-in; guest app; reputation/review integration; cross-vertical (restaurant + spa + retail all post to one folio).

---

## 6. Restaurant — vs **Toast, TouchBistro, Square for Restaurants**

**Current maturity: ~35%.** Feature-rich surface (KOT, modifiers, courses, split/merge) but architecturally fragile — the audit found **checkout calls itself over HTTP**, no recipe depletion, and reservations/waiter hacked into the `table.name` string.

- **T1 Parity:** replace the HTTP self-call with one internal transaction; **recipe/BOM ingredient depletion**; tax + service charge + gratuity on the bill; KDS with real-time push (not polling); per-location **daily 86** (not global `isActive`); proper table/waiter model (FKs, not encoded strings); coursing/firing integrity across split/merge/void.
- **T2 Competitive:** online ordering + delivery (own + aggregators); reservations/waitlist with SMS; deep menu engineering & modifier logic; time-based pricing (happy hour); tip pooling/distribution; multiple revenue centers; kitchen analytics (ticket times); loyalty.
- **T3 Leadership:** AI prep forecasting; dynamic menu/pricing; QR/voice order-at-table; ghost-kitchen multi-brand on one kitchen; labor-vs-sales optimization.

---

## 7. HRM / Payroll — vs **Gusto, Deel, Workday**

**Current maturity: ~30%.** Most complete *surface* of the back-office modules, but the audit found real payroll math bugs (overnight shifts → 0 hours, advances double-charged, client-trusted net) and no statutory compliance.

- **T1 Parity:** payroll engine that **derives** deductions/overtime/net server-side from attendance; timezone- & overnight-correct time math (store timestamps, not `HH:MM`); fix the advance double-charge; `@@unique(business, employee, month)`; **statutory deductions** (income tax, social security, pension per country); compliant payslips; leave accrual with working-day calendar + overlap detection; geofenced/biometric clock-in.
- **T2 Competitive:** payroll tax filing & remittance; multi-country payroll; benefits admin; expense reimbursement; performance/reviews; org chart + approval workflows; employee self-service; e-signature onboarding.
- **T3 Leadership:** **earned-wage access** (the advance feature is already half of this); contractor/EOR payments (Deel-style); AI shift scheduling; per-jurisdiction compliance automation.

---

## 8. Construction — vs **Procore, Buildertrend, Sage job costing**

**Current maturity: ~30%.** Tight MVP for job-costing, but the audit found labor actuals double-count and "stage billing" produces no actual AR.

- **T1 Parity:** one source of truth for actuals (stop double-counting `LaborEntry` + line `actual`); milestone billing → real **AR + retention release**; change orders; CSI cost codes; committed costs (open POs) vs actual vs budget; role guards on cost-posting endpoints.
- **T2 Competitive:** subcontractor management + compliance (insurance, lien waivers); progress billing (AIA G702/G703); time & materials; equipment tracking; daily logs + photos (started); RFIs/submittals.
- **T3 Leadership:** predictive cost-overrun alerts; tight accounting integration; offline mobile field app.

---

## 9. Wholesale / Distribution — vs **Cin7, NetSuite, TradeGecko**

**Current maturity: ~30%.** Clean fulfillment state machine, but the audit found **no stock decrement** and receivables sit in a parallel ledger disconnected from credit.

- **T1 Parity:** decrement stock on pick/dispatch; post receivables to the **shared credit ledger**; cap payments at outstanding + role guards; tiered/customer-group pricing (partly exists); collision-safe order numbers.
- **T2 Competitive:** van/route sales + delivery management; backorders/partial fulfillment; sales-rep commissions; credit terms + AR aging; quantity-break pricing; returns (RMA); B2B order portal/EDI.
- **T3 Leadership:** B2B e-commerce portal; vendor-managed inventory (auto-replenish customers); demand sensing across the network.

---

## 10. Credit / BNPL — vs **Klarna patterns, M-KOPA, Lipa Later** *(a genuine fintech wedge)*

**Current maturity: ~50% — the best-architected module.** Ledger-as-source-of-truth is exactly right. But the headline feature (credit limit) is **unenforced**, the ledger isn't concurrency-safe, and the public pay page has an XSS hole.

- **T1 Parity:** enforce the credit limit at checkout (pass real `creditLimit` + `currentBalance`, or gate in `postDebit`); row-lock the ledger; record down payments as ledger entries; consistent overdue definition; escape the public-page HTML.
- **T2 Competitive:** credit scoring/underwriting; dynamic limits; interest & late-fee engine; automated reminders (SMS/WhatsApp); collections workflow; bureau reporting where available.
- **T3 Leadership:** **BNPL underwriting from the merchant's own transaction history** — Balanzify owns the sales data the lenders don't; risk-based pricing; financing-partner/securitization integration; diaspora-guaranteed credit (ties to the existing diaspora pay links). This could be a bigger business than the POS.

---

## 11. Finance / Accounting — vs **QuickBooks, Xero, Zoho Books**

**Current maturity: ~15%.** Expenses, payment accounts, and petty cash exist, but there is **no general ledger / double-entry core**. This is the connective tissue every other module's money should flow into — its absence is why the audits keep finding "parallel ledgers."

- **T1 Parity:** double-entry **GL** + chart of accounts; automatic journal entries from sales/purchases/payroll/credit; bank reconciliation; AR/AP aging; trial balance; P&L, balance sheet, cash-flow statement.
- **T2 Competitive:** budgeting; multi-currency accounting; fixed assets/depreciation; tax returns; accountant access; full audit trail.
- **T3 Leadership:** real-time close; AI transaction categorization; cash-flow forecasting (feeds Insights); one set of books across all of an owner's verticals.

---

## 12. SaaS / Billing platform — vs **Stripe Billing, Chargebee**

**Current maturity: ~30%.** Stripe integration exists, but the audit found **authorization is cosmetic** — owners self-grant paid modules and the cross-tenant admin console.

- **T1 Parity:** real platform-operator identity (superadmin is *not* a tenant-toggleable module); gate paid modules on an active subscription, not self-service; webhook idempotency; dunning/failed-payment lifecycle; enforce seat limits.
- **T2 Competitive:** self-serve plan changes with proration; subscription invoicing + tax; **mobile-money as a SaaS payment method** (your customers don't all have cards); trials; coupons; usage metering.
- **T3 Leadership:** hybrid module-based + usage-based pricing; reseller/partner billing; white-label.

---

## 13. AI Insights — vs **Shopify Sidekick, Square dashboards** *(your other real differentiator)*

**Current maturity: ~60% — conceptually competitive.** Grounded merchant advisor with real data aggregation, caching, and graceful degradation. Held back by an outdated hardcoded model id and a few metric bugs.

- **T1 Parity:** move to a current model, env-configurable (e.g. `claude-opus-4-8` for advisory quality or `claude-sonnet-4-6` for cost/latency) with **prompt caching** on the system block; bound/evict the context cache (use Redis); fix metrics (worst-day must include zero-sale days; AR from a full query, not top-5 spenders).
- **T2 Competitive:** conversational assistant ("ask anything about my business"); proactive anomaly alerts; forecasting; **agentic actions** ("reorder this", "discount that") executed through the existing APIs.
- **T3 Leadership:** an **autonomous operations agent spanning all modules** — the multi-vertical data is a moat no single-vertical incumbent has; anonymized peer benchmarking; voice in local languages (Somali, Swahili, Amharic).

---

## 14. Frontend / Client platform — vs **Square / Toast apps**

**Current maturity: ~35%.** Impressive self-contained mock backend and a clean theme system, but type-checking is disabled (~2,380 `any`), there's no offline, no data layer, and the refresh-token flow is unused.

- **T1 Parity:** offline-first PWA + sync (§0.1); re-enable type-checking incrementally (adopt the existing `lib/types.ts`); a real data layer (React Query) for loading/error/empty states; token refresh + 401 retry; accessibility pass (label/control linkage, aria on icon buttons).
- **T2 Competitive:** formal design system (promote `theme.ts` to CSS variables + primitives); native mobile apps; hardware integration; real-time (WebSocket) for KDS/orders; performance (debounce/memoize).
- **T3 Leadership:** extensibility/app platform; white-label theming; deep local-language i18n.

---

## Sequencing to elite

**Phase 1 — Foundations & trust (months 0–3).** §0.4 correctness (tenant isolation, Decimal money, locked ledgers), the P0 security/revenue fixes, and **offline-first (§0.1)**. Nothing else matters if the core leaks money and dies without internet.

**Phase 2 — Make inert features real (months 2–4).** Activate FIFO, hotel night-audit, restaurant recipes + tax, payroll correctness, wholesale/construction ledger integration, working PDF/exports. This alone moves every module from "demo" to "operable."

**Phase 3 — Pick two verticals and go deep (months 4–9).** Recommended pair: **Retail/POS + Pharmacy**, *or* **Restaurant + Hotel** (they share the folio/recipe/KDS machinery). Take the chosen two to T2 across the board and seed T3 differentiators.

**Phase 4 — The wedges (parallel, ongoing).** The two places Balanzify can *beat* the elites rather than match them: **embedded credit/BNPL** (you own the transaction data lenders covet) and the **cross-vertical AI operations agent**. Plus the accounting GL (§11) that ties every module's money into one set of books — something no single-vertical incumbent can offer a diversified owner.

**The honest bottom line:** reaching elite is not about more modules — it's about depth, reliability, offline, and compliance on a focused subset, plus leaning hard into the two genuinely defensible wedges (embedded finance + multi-vertical AI) that the incumbents structurally cannot copy.
