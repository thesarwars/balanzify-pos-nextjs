# Balanzify POS — Epics

Epics group the delivered feature set into shippable value streams. Each lists scope, key screens, and the API groups involved. Status reflects the prototype (front-end complete; backend = contract defined).

---

## EPIC-01 · Identity & Onboarding
**Goal:** A business can self-register, sign in, and manage who has access.
- Business registration wizard (business → tax → admin → review), currency/timezone, disposable-email guard.
- OAuth2 login (Bearer tokens), session.
- Users (location access, max discount, commission %), Roles (grouped permission matrix), permission catalogue.
- Screens: `Register.jsx`, `Screens.jsx` (Login), `UsersRoles.jsx`. API: `business`, `auth`, `user`, `role`, `permissions`.

## EPIC-02 · Product & Catalog
**Goal:** Maintain a rich, multi-type catalog with stock control.
- Single / variable (variations) / combo products; units & multi-unit; brands; tax rates & **tax groups**; alert qty; not-for-selling; opening stock; duplicate.
- Selling **price groups** (wholesale/retail/per-location); per-product overrides.
- Barcode **label printing**; CSV **import/export** with per-row validation.
- Screens: `Products.jsx`, `Labels.jsx`, `ImportExport.jsx`, `Adjustments.jsx`. API: `product`, `unit`, `brand`, `variation`, `taxRate`, `priceGroup`, `stockAdjustment`.

## EPIC-03 · Point of Sale
**Goal:** A fast, real-world counter experience.
- Searchable grid (card/list/category), **live available-stock** (on-hand − cart reservation), variation & combo handling.
- Customer & customer-group pricing, price-group switcher, **types of service** (Restaurant) with packing charges, loyalty redeem.
- **Cash register** (open/close/reconcile, per-method logging), payment depth (**split tender, change, credit, express cash**), **parked orders** (suspend/draft/quote).
- Refresh-guard for unsaved cart.
- Screen: `POS.jsx`. API: `sell`, `register`, `heldSale`, `priceGroup`, `serviceType`, `reward`, `contact`, `customerGroup`.

## EPIC-04 · Sales, Returns & Reporting
**Goal:** Track every sale and refund; report on performance.
- Sales history; **sell returns** (restock, points reversal).
- Reports: Overview, **Sales Representative / commission**, **Cash Register** report.
- Screens: `Screens.jsx`, `DataScreen.jsx`. API: `sell`, `sellReturn`, `report`, `register`.

## EPIC-05 · Contacts & Relationships
**Goal:** Manage customers and suppliers with ledgers.
- Customers/suppliers, **ledger**, opening/advance balance, credit limit, customer groups; receive/pay payments.
- Screen: `Contacts.jsx`. API: `contact`, `customerGroup`.

## EPIC-06 · Inventory Operations
**Goal:** Move and adjust stock accurately across locations.
- Multiple **locations** (invoice scheme/layout, price group, payment methods, enable/disable with keep-one-active guard).
- **Purchases** + opening stock; **stock transfers** (status flow); **stock adjustments** (normal/abnormal).
- Screens: `Locations.jsx`, `Purchases.jsx`, `Transfers.jsx`, `Adjustments.jsx`. API: `location`, `purchase`, `openingStock`, `transfer`, `stockAdjustment`.

## EPIC-07 · Orders
**Goal:** Order documents that convert into transactions.
- **Sales orders** & **purchase orders** (ordered/partial/completed); convert SO→sale, PO→purchase.
- Screen: `Orders.jsx`. API: `salesOrder`, `purchaseOrder`.

## EPIC-08 · Promotions & Loyalty
**Goal:** Drive repeat business.
- **Discounts** by brand/category/location with priority + date range; **loyalty / reward points** (earn/redeem settings, members).
- Screens: `Discounts.jsx`, `Loyalty.jsx`. API: `discount`, `reward`.

## EPIC-09 · Finance & Accounting
**Goal:** Track money beyond sales.
- **Expenses** (categories, account draw-down, refunds); **payment accounts** (cash/bank/mobile money, deposit, fund transfer).
- Screen: `Finance.jsx`. API: `expense`, `paymentAccount`.

## EPIC-10 · Invoicing & Output
**Goal:** Professional, configurable documents.
- **Invoice layouts** (classic/elegant/slim-80mm, header/footer, address, tax summary, total-in-words, QR, letterhead, gift receipt) with live preview & print.
- Screen: `InvoiceLayouts.jsx`. API: `invoiceLayout`.

## EPIC-11 · Platform, Modules & Billing
**Goal:** Sell the suite as core + add-ons.
- **Plan & Modules** with per-module pricing and live plan total; server-side gating (`moduleOn`).
- Screen: `DataScreen.jsx`. API: `module`.

## EPIC-12 · Restaurant Add-on
**Goal:** Full-service & QSR operations.
- **Tables**, **service staff (PIN)**, **modifiers**, **live kitchen display**; types-of-service at the till.
- Screen: `Restaurant.jsx`. API: `restaurant`, `serviceType`.

## EPIC-13 · HRM / Essentials Add-on
**Goal:** Manage the workforce, tied to the till.
- **Employees** (profiles with sales/commission, cashier link, avatars), **Departments/Designations**, **Attendance** (clock/break/grace/flexible/running/auto-absent), **monthly report**, **Shifts + swaps**, **Leave** (dynamic types, overrides, balances/accrual, approver), **Payroll** (overtime/bonus/incentive/deductions, payslip + settings), **Advances/loans** (account draw-down, payroll recovery), **Tasks**. Filters + Export/Print on every tab.
- Screen: `HRM.jsx`. API: `hrm`.

## EPIC-14 · Superadmin / SaaS Add-on
**Goal:** Operate the platform across all tenants.
- **Businesses** (activate/deactivate/login-as), **Packages** (subscription plans), **Payments** (approve offline), **Gateways** (Offline/Stripe), MRR dashboard.
- Screen: `Superadmin.jsx`. API: `superadmin`.

## EPIC-15 · Developer Experience & Integration Layer
**Goal:** One swappable API surface; mock today, live tomorrow.
- `window.API` client, mock route table, transport (mock⇄live + Bearer), adapters, pagination envelope, **request log**, Mock/Live toggle.
- Screen: `ApiPanel.jsx`. API: `config`.
