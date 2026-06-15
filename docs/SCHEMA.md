# Balanzify POS — Data Schema

Logical data model derived from the API contract (`app/api.jsx`). Money is stored to 2–4 dp; IDs are integers unless noted. The backend should add `business_id` (tenant), timestamps, and soft-deletes to every table. Relationships are noted with → (FK).

---

## Identity & tenancy

### business
`id, name, start_date, currency_id→currency, time_zone, tax_label_1, tax_number_1, tax_label_2, tax_number_2, created, status`

### currency
`id, code, symbol, name`  (USD, SOS, KES, ETB, AED, EUR, GBP)

### user
`id, business_id→business, name, email, username (unique), password(hash), role_id→role, location_access ('all' | [location_id]), commission_percent, max_discount, is_active, allow_login`

### role
`id, business_id, name, is_default, permissions ('all' | [key]), location_access, user_count`

### permission
`key, group, label`  (groups: POS, Products, Sales, Contacts, Purchases, Reports, Settings, User management)

---

## Catalog

### product
`id, business_id, type ('single'|'variable'|'combo'), name, sku (unique), category_id→category, brand_id→brand, unit, tax_id→tax_rate, alert_quantity, enable_stock, not_for_selling, price, cost, stock, image_url, swatch, group_prices {price_group_id: override}`
- variations[] (variable): `{ id, name, sub_sku, cost, price, stock }`
- combo[] (combo): `{ product_id→product, qty }`

### category
`id, business_id, name, parent_id?`

### brand
`id, business_id, name`

### unit
`id, business_id, actual_name, short_name, allow_decimal, base_unit_id?, base_unit_multiplier?`

### variation_template
`id, business_id, name, values [{ id, name }]`

### tax_rate
`id, business_id, name, amount(%)`

### tax_group
`id, business_id, name, tax_ids [tax_rate.id]`   (total_rate = Σ members)

### selling_price_group
`id, business_id, name, percent, is_default`

---

## Point of sale & sales

### sell (transaction, type=sell)
`id, business_id, location_id→location, contact_id→contact, customer_name, invoice_no, transaction_date, status ('final'), total_before_tax, tax_amount, discount_amount, discount_type ('fixed'|'percentage'), final_total, amount_paid, change_return, payment_status ('paid'|'partial'|'due'), method, redeem_points, source, invoice_url`
- sell_lines[]: `{ product_id, variation, quantity, unit_price }`
- payments[]: `{ method, amount }`

### sell_return
`id, transaction_id→sell, invoice_no, return_total, status('refunded')`
- lines[]: `{ line_index, quantity, unit_price }`  (restocks; reverses reward points)

### held_sale (parked)
`id, business_id, ref, type ('suspended'|'draft'|'quotation'), customer_id, customer_name, cart[], total, item_count, created_at`

### cash_register (session)
`id, business_id, user_name, shift {id,start,end,employee_id}?, location_id, opening_cash, opened_at, closed_at, status ('open'|'closed'), totals {cash,zaad,evc,card,bank,advance}, refunds, total_sales, tx_count, expected_cash, closing {total_cash,total_card,total_cheque,note}`

---

## Contacts

### contact
`id, business_id, type ('customer'|'supplier'|'both'), name, contact_id (CO/SP/CT prefix), mobile, email, address, tax_number, customer_group_id→customer_group, pay_term_number, pay_term_type, credit_limit, opening_balance, advance_balance, total_sale, total_purchase, total_paid, due`

### customer_group
`id, business_id, name, amount (price-calc %)`

### contact_ledger (derived/event)
`contact_id, date, type ('opening_balance'|'sell'|'purchase'|'payment'|'advance'), ref, debit, credit`

### contact_payment
`id, contact_id, amount, kind ('receive'|'pay'), method, note, date`

---

## Locations & schemes

### location (business_location)
`id, business_id, name, type, landmark, city, mobile, manager, invoice_scheme_id, invoice_layout_id, price_group_id, payment_methods [key], default_payment, status ('active'|'inactive')`

### invoice_scheme
`id, name, prefix, number_type, start_number, total_digits, is_default`

### invoice_layout
`id, name, is_default, design ('classic'|'elegant'|'slim'), header_text, footer_text, show_address, show_tax_summary, show_total_in_words, show_discount, hide_prices(gift), show_qr, show_letterhead`

### payment_method
`key, label`

---

## Inventory operations

### purchase
`id, business_id, ref_no, supplier_id→contact, location_id, date, status ('received'), payment_status, discount, tax, paid, grand_total, due, item_count`
- lines[]: `{ product_id, qty, unit_cost }`  (adds stock; raises supplier payable)

### opening_stock
`product_id, variation?, qty (delta)`

### stock_transfer
`id, business_id, ref, from_location_id, to_location_id, date, status ('pending'|'in_transit'|'completed'), item_count, total_value`
- lines[]: `{ product_id, qty, unit_cost }`  (moves stock on completion; completed locks)

### stock_adjustment
`id, business_id, ref, location_id, date, type ('normal'|'abnormal'), reason, item_count, total_value`
- lines[]: `{ product_id, qty }`  (reduces stock)

---

## Orders

### purchase_order
`id, ref, supplier_id, location_id, date, status ('ordered'|'partial'|'completed'), total, item_count`
- lines[]: `{ product_id, qty, unit_cost }`   (convert → purchase)

### sales_order
`id, ref, contact_id, location_id, date, status ('ordered'|'partial'|'completed'), total, item_count`
- lines[]: `{ product_id, qty, unit_price }`   (convert → sell)

---

## Promotions & loyalty

### discount
`id, business_id, name, brand_id?, category?, location_id?, priority, type ('fixed'|'percentage'), value, starts_at, ends_at, apply_price_groups, apply_customer_groups, is_active`

### reward_point_setting
`enabled, display_name, amount_per_unit_point, min_order_total_earn, max_points_per_order, redeem_amount_per_point, min_order_total_redeem, min_redeem_point, max_redeem_point, expiry_period, expiry_type`

### reward_member (derived)
`id, name, contact_id, mobile, lifetime_points, points, tier, total_sale`

---

## Finance

### expense
`id, business_id, ref, date, category_id→expense_category, location_id, account_id→payment_account, amount, payment_status ('paid'|'due'), expense_for, note, is_refund`

### expense_category
`id, name`

### payment_account
`id, business_id, name, type ('Cash'|'Bank'|'Mobile money'|'Other'), account_number, balance`
- transfer: `{ from_id, to_id, amount }`; deposit: `{ id, amount }`

---

## Platform / billing

### module
`key, name, icon, group, enabled, core, addon, price`  (Hotel/Restaurant/Pharmacy/Construction/Superadmin/HRM/Wholesale/AI = addon)

### package (SaaS)
`id, name, price, interval ('monthly'|'yearly'), locations, users, products, featured, active`

### sa_business (tenant)
`id, name, owner, email, country, package_id→package, status ('active'|'trial'|'expired'), users, created, expires`

### sa_payment
`id, business, amount, gateway ('Stripe'|'Offline'), date, status ('completed'|'pending')`

### sa_gateway
`{ offline: bool, stripe: bool }`

---

## Restaurant add-on (gated)

### table
`id, name, location_id, seats, status ('free'|'occupied')`

### service_staff
`id, name, pin, location_id`

### modifier_set
`id, name, options [{ name, price }]`

### kitchen_order (KOT)
`id, table, staff, items [{ name, qty }], status ('preparing'|'ready'|'served'), time`

### types_of_service
`id, name, price_group_id, packing_charge, packing_charge_type ('fixed'|'percentage'), enabled`

---

## HRM add-on (gated)

### employee
`id, name, email, department, designation, location_id, salary, joined, status ('active'|'on_leave'), user_id→user (cashier link), commission_percent`

### hrm_settings
`work_start, grace_minutes, standard_hours, half_day_hours, overtime_rate, working_days, late_deduction, absent_deduction ('day'|number)`

### emp_shift (assignment)
`{ employee_id: { type ('fixed'|'flexible'), start, end } }`

### attendance
`id, employee_id, date, clock_in, clock_out, status ('present'|'late'|'absent'|'running'|'on break'), breaks [{ start, end }]`  (hours = out−in−breaks)

### shift (roster)
`id, employee_id, location_id, date, start, end, role`

### shift_swap
`id, shift_id, from_id, to_id, reason, status ('pending'|'approved'|'rejected'), date`  (approve reassigns shift)

### leave_type
`id, name, default_days, accrues, paid`   (admin-managed, dynamic)

### emp_leave_override
`{ employee_id: { typeName: days } }`

### leave
`id, employee_id, type→leave_type.name, from, to, days, reason, status ('pending'|'approved'|'rejected'), approved_by`
- balance (derived): entitlement (accrual pro-rated) − approved taken; over-balance blocked for paid types.

### payroll
`id, employee_id, month, basic, allowance, overtime, bonus, incentive, deduction, net, status ('paid')`
- payslip (derived): earnings + deductions breakdown (late/absent/advance) + attendance + leave; sections toggled by `payslip_settings`.

### advance (loan)
`id, employee_id, amount, date, account_id→payment_account, note, outstanding, status ('outstanding'|'settled')`  (draws account; recovered via payroll deduction)

### hr_todo (task)
`id, title, assigned_to→employee, priority ('high'|'medium'|'low'), status ('pending'|'done'), due`

### department / designation
`name, count`  (admin-managed lists; delete blocked while in use)
