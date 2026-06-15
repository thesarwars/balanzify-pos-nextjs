# Balanzify POS — User Stories

Format: **As a `<role>`, I want `<capability>`, so that `<value>`.** Acceptance criteria (AC) reflect the delivered prototype. Roles: Owner/Admin, Cashier, Inventory Clerk, Manager, Accountant, HR Admin, Platform Owner (Superadmin), Customer.

---

## Identity & Onboarding (EPIC-01)
- **As an Owner**, I want to register my business in a guided wizard, so that I can start using the system quickly.
  - AC: 4 steps (business/tax/admin/review); currency & timezone from API; disposable emails rejected; username unique ≥4; password ≥6; success returns to Login prefilled.
- **As an Admin**, I want to create users with roles and location access, so that staff see only what they should.
  - AC: assign role, location access (all/list), max discount, commission %; can't delete the only Admin.
- **As an Admin**, I want a permission matrix per role, so that I control capabilities granularly.
  - AC: grouped permissions; Admin always all-permissions; default roles undeletable; role with users can't be deleted.

## Catalog (EPIC-02)
- **As an Inventory Clerk**, I want to add single/variable/combo products with units, tax, and alert qty, so that the catalog matches reality.
  - AC: variations grid with fill-down; combo builder; SKU auto-generates; opening stock; not-for-selling.
- **As a Manager**, I want selling price groups (wholesale/retail), so that I can price per channel/location.
  - AC: % adjustment or per-product override; POS switcher re-prices tiles & cart.
- **As an Inventory Clerk**, I want to import/export products via CSV, so that bulk maintenance is fast.
  - AC: template download; paste/upload; per-row validation (unit/category/number); only valid rows import.
- **As a Clerk**, I want to print barcode labels, so that items can be scanned.
  - AC: pick products + qty, choose fields, per-row layout, print sheet.

## Point of Sale (EPIC-03)
- **As a Cashier**, I want to see live available stock as I build an order, so that I never oversell.
  - AC: tile shows on-hand − in-cart; updates on +/−; "Out" at zero; display-only until charged.
- **As a Cashier**, I want a refresh warning when a cart is unsaved, so that I don't lose an order.
  - AC: `beforeunload` prompt fires only when cart has items.
- **As a Cashier**, I want split/credit payments and change, so that I can handle any tender.
  - AC: multiple pay lines; change return; remaining → customer credit (requires customer); express cash.
- **As a Cashier**, I want to open/close a cash register and reconcile, so that the drawer balances.
  - AC: cash-in-hand open (optionally against a scheduled shift); per-method logging; counted vs expected with balanced/over/short.
- **As a Cashier**, I want to suspend/draft/quote an order, so that I can park and resume it.
  - AC: parked list; resume restores cart+customer; drafts/quotes don't deduct stock.

## Sales, Returns & Reports (EPIC-04)
- **As a Cashier**, I want to process returns, so that refunds restock items.
  - AC: select lines; restock; reverse reward points; status refunded.
- **As a Manager**, I want commission and cash-register reports, so that I can review performance.
  - AC: per-rep sales/commission; per-session register report with reconciliation.

## Contacts (EPIC-05)
- **As an Accountant**, I want customer/supplier ledgers with balances, so that I can track dues.
  - AC: ledger drawer; opening/advance balance; credit limit; receive/pay payments; customer groups.

## Inventory Ops (EPIC-06)
- **As a Manager**, I want multiple locations with their own schemes, so that branches operate independently.
  - AC: invoice scheme/layout, price group, payment methods; enable/disable can't leave zero active.
- **As a Clerk**, I want purchases, transfers, and adjustments, so that stock stays accurate.
  - AC: purchase adds stock + supplier liability; transfer status flow (completed locks); adjustment reduces stock with reason.

## Orders (EPIC-07)
- **As a Manager**, I want sales/purchase orders that convert, so that quotes become transactions.
  - AC: status ordered/partial/completed; PO→purchase (stock in), SO→sale (stock out).

## Promotions & Loyalty (EPIC-08)
- **As a Manager**, I want discounts by brand/category/location with dates, so that promotions are targeted.
  - AC: priority, fixed/%, date window, active/scheduled/off.
- **As an Owner**, I want loyalty points, so that customers return.
  - AC: earn/redeem settings; members ledger; redeem at till.

## Finance (EPIC-09)
- **As an Accountant**, I want expenses and payment accounts, so that I track all money.
  - AC: expense draws its account; refund adds back; accounts support deposit & fund transfer.

## Invoicing (EPIC-10)
- **As an Owner**, I want configurable invoice layouts with live preview, so that receipts look professional.
  - AC: designs, header/footer, address/tax/total-in-words/QR/letterhead/gift-receipt toggles; print.

## Platform & Billing (EPIC-11)
- **As an Owner**, I want to enable paid add-on modules, so that I only pay for what I use.
  - AC: per-module pricing; live plan total; enabling a module unlocks its features (gated).

## Restaurant (EPIC-12)
- **As a Restaurant Manager**, I want tables, staff PINs, modifiers, and a kitchen display, so that service runs smoothly.
  - AC: table free/occupied; staff PIN; modifier sets; KOT preparing→ready→served; types-of-service packing charge at till.

## HRM (EPIC-13)
- **As an HR Admin**, I want employee profiles tied to POS sales, so that performance is visible.
  - AC: profile drawer with cashier link, sales/commission, payroll+payslip, attendance, leave, advances.
- **As an HR Admin**, I want attendance with grace, breaks, flexible shifts, and total hours, so that time is fair and accurate.
  - AC: clock in/out/break; grace window; flexible staff exempt from late; running status with live hours; auto-absent.
- **As an HR Admin**, I want dynamic leave types with per-employee entitlements and approver tracking, so that leave is flexible and auditable.
  - AC: admin-created types; overrides; balances/accrual; over-balance blocked; "Approved by" recorded.
- **As an HR Admin**, I want payroll with overtime/bonus/incentive/deductions and configurable payslips, so that pay is complete and clear.
  - AC: overtime from hours; late/absent deductions + advance recovery pre-filled; payslip sections toggleable; print.
- **As an HR Admin**, I want shifts with swap requests and advances/loans, so that scheduling and staff finance are managed.
  - AC: roster; swap approve reassigns shift; advance draws an account and recovers via payroll.
- **As an HR Admin**, I want filters and export/print on every tab, so that I can find and share data.
  - AC: search + department + status filters; CSV export & print reflect active filters.

## Superadmin / SaaS (EPIC-14)
- **As a Platform Owner**, I want to manage all businesses, packages, and payments, so that I can run the SaaS.
  - AC: activate/deactivate/login-as; create packages; approve offline payments; Offline/Stripe gateways; MRR dashboard.

## Developer / Integration (EPIC-15)
- **As a Developer**, I want one API client with a mock/live toggle and request log, so that I can build the backend to a fixed contract.
  - AC: `window.API`; transport mock⇄live + Bearer; pagination envelope; flip to Live with base URL, no screen changes.
