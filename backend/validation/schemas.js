const { z } = require('zod');

// ── Primitives ──────────────────────────────────────────────────────────────
const uuid = z.string().uuid('Invalid ID format');
const money = z.coerce.number().nonnegative('Must be 0 or greater').multipleOf(0.01);
const positiveInt = z.coerce.number().int().positive();
const nonNegInt = z.coerce.number().int().nonnegative();
const shortStr = (max = 255) => z.string().trim().min(1).max(max);
const optStr = (max = 255) => z.string().trim().max(max).optional().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional().nullable();
const email = z.string().email('Invalid email').toLowerCase().trim();
const phone = z.string().trim().max(30).optional().nullable();

// ── Auth ────────────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  businessName: shortStr(200),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  phone: phone,
  country: optStr(100),
});

const LoginSchema = z.object({
  email,
  password: z.string().min(1, 'Password required').max(128),
});

const PinLoginSchema = z.object({
  pin: z.string().min(4).max(10).regex(/^\d+$/, 'PIN must be numeric'),
  business_id: uuid,
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

const VerifyMfaSchema = z.object({
  token: z.string().length(6).regex(/^\d+$/, 'MFA token must be 6 digits'),
});

// ── Products ─────────────────────────────────────────────────────────────────
const ProductSchema = z.object({
  custom_values: z.record(z.string().max(64), z.string().max(500)).optional().nullable(),
  name: shortStr(255),
  sku: optStr(100),
  barcode: optStr(100),
  description: optStr(1000),
  category_id: uuid.optional().nullable(),
  brand_id: uuid.optional().nullable(),
  // Free-form so businesses can manage their own units (see Unit reference table).
  unit_of_measure: z.string().trim().min(1).max(50).default('unit'),
  cost_price: money.default(0),
  selling_price: money.default(0),
  wholesale_price: money.default(0),
  min_stock_level: nonNegInt.default(0),
  max_stock_level: nonNegInt.default(0),
  reorder_point: nonNegInt.default(0),
  track_expiry: z.boolean().default(false),
  allow_price_override: z.boolean().default(true),
  is_active: z.boolean().default(true),
  notes: optStr(2000),
  opening_stock: nonNegInt.optional(),
  location_id: uuid.optional().nullable(),
  // Catalog profile (reference product form)
  barcode_type: z.enum(['C128', 'C39', 'EAN13', 'EAN8', 'UPCA', 'UPCE']).optional(),
  weight: z.coerce.number().nonnegative().optional().nullable(),
  prep_time_minutes: z.coerce.number().int().nonnegative().max(100000).optional().nullable(),
  not_for_selling: z.boolean().optional(),
  enable_stock: z.boolean().optional(),
  selling_price_tax_type: z.enum(['exclusive', 'inclusive']).optional(),
  tax_rate_id: uuid.optional().nullable(),
  is_serialized: z.boolean().optional(),
  brochure_url: optStr(500),
  brochure_key: optStr(500),
  location_ids: z.array(uuid).max(100).optional(),
  tile_color: optStr(10),
});

// ── Sales ────────────────────────────────────────────────────────────────────
const SaleItemSchema = z.object({
  product_id: uuid,
  quantity: positiveInt,
  override_price: money.optional().nullable(),
  notes: optStr(500),
});

const SaleSchema = z.object({
  idempotency_key: z.string().min(10).max(256),
  items: z.array(SaleItemSchema).min(1, 'At least one item required'),
  customer_id: uuid.optional().nullable(),
  location_id: uuid.optional().nullable(),
  payment_method: z.enum(['cash','zaad','visa','mastercard','split','credit']).default('cash'),
  discount_type: z.enum(['pct','flat']).default('pct'),
  discount_value: money.default(0),
  cash_tendered: money.optional(),
  cash_amount: money.optional(),
  zaad_amount: money.optional(),
  card_amount: money.optional(),
  notes: optStr(1000),
  type: z.enum(['pos','order','invoice','credit']).default('pos'),
  shift_id: uuid.optional().nullable(),
}).refine(d => {
  if (d.payment_method === 'split') {
    return (d.cash_amount ?? 0) + (d.zaad_amount ?? 0) + (d.card_amount ?? 0) > 0;
  }
  return true;
}, { message: 'Split payment amounts must sum to more than zero' });

const RefundSchema = z.object({
  items: z.array(z.object({
    sale_item_id: uuid,
    product_id: uuid,
    quantity: positiveInt,
    unit_price: money,
    restock: z.boolean().default(true),
  })).min(1),
  reason: optStr(500),
  refund_method: z.enum(['cash','zaad','visa','mastercard']).default('cash'),
  restock: z.boolean().default(true),
});

const ShiftOpenSchema = z.object({
  location_id: uuid.optional().nullable(),
  opening_float: money.default(0),
});

const ShiftCloseSchema = z.object({
  actual_cash: money,
  notes: optStr(500),
});

const HoldSaleSchema = z.object({
  label: optStr(100),
  customer_name: optStr(255),
  items: z.array(z.any()).min(1),
  subtotal: money,
  shift_id: uuid.optional().nullable(),
});

// ── Purchase Orders ───────────────────────────────────────────────────────────
const POItemSchema = z.object({
  product_id: uuid,
  ordered_qty: positiveInt,
  unit_price: money, // NET cost per purchase unit (after line discount)
  unit_id: uuid.optional().nullable(), // purchase unit; null = product's base unit
  discount_percent: money.default(0),  // informational; unit_price is already net
  selling_price: money.optional(),     // applied to the product at receipt
  expiry_date: isoDate,
  batch_number: optStr(100),
  notes: optStr(500),
});

const PurchaseOrderSchema = z.object({
  supplier_id: uuid,
  location_id: uuid.optional().nullable(),
  items: z.array(POItemSchema).min(1),
  reference_no: optStr(50),
  order_date: isoDate,
  status: z.enum(['ordered', 'pending', 'received']).optional(),
  expected_delivery: isoDate,
  discount_amount: money.default(0),      // order-level discount
  tax_amount: money.default(0),           // purchase tax
  tax_rate_id: uuid.optional().nullable(),// which rate produced it (Tax Report)
  shipping_charges: money.default(0),
  shipping_details: optStr(500),          // carrier / tracking / handling notes
  document_url: optStr(500),              // attached document (invoice scan) — uploaded file URL
  document_key: optStr(255),
  additional_expenses: z.array(z.object({ name: optStr(100), amount: money.default(0) })).max(20).optional(),
  freight_cost: money.default(0),
  customs_duty: money.default(0),
  other_charges: money.default(0),
  payment_terms: nonNegInt.default(0),
  notes: optStr(2000),
  currency: z.string().length(3).default('USD'),
});

// Editing a purchase — every field optional. The route decides what may
// actually change based on whether the purchase has been received.
const PurchaseOrderUpdateSchema = z.object({
  supplier_id: uuid.optional(),
  location_id: uuid.optional().nullable(),
  items: z.array(POItemSchema).optional(),
  reference_no: optStr(50),
  order_date: isoDate,
  status: z.enum(['ordered', 'pending', 'received']).optional(),
  expected_delivery: isoDate,
  discount_amount: money.optional(),
  tax_amount: money.optional(),
  tax_rate_id: uuid.optional().nullable(),
  shipping_charges: money.optional(),
  shipping_details: optStr(500),
  document_url: optStr(500),
  document_key: optStr(255),
  additional_expenses: z.array(z.object({ name: optStr(100), amount: money.default(0) })).max(20).optional(),
  payment_terms: nonNegInt.optional(),
  notes: optStr(2000),
});

const POStatusSchema = z.object({
  status: z.enum(['draft','pending_approval','approved','sent','partial','received','cancelled']),
  received_items: z.array(z.object({
    id: uuid,
    product_id: uuid,
    qty: nonNegInt,
    unit_price: money,
    expiry_date: isoDate,
    batch_number: optStr(100),
  })).optional(),
});

const POPaymentSchema = z.object({
  amount: money.refine(v => v > 0, 'Amount must be greater than 0'),
  payment_method: z.enum(['cash','bank_transfer','cheque','zaad','mobile']),
  reference: optStr(100),
  notes: optStr(500),
  paid_on: isoDate,                       // when the payment was actually made (defaults to now)
});

// Standalone purchase return: pick supplier + location + products. The server
// resolves each product to the supplier's purchase lines (oldest first) so every
// returned unit still relieves the exact cost layer it was received on.
const PurchaseReturnCreateSchema = z.object({
  supplier_id: uuid,
  location_id: uuid,
  reference: optStr(100),
  notes: optStr(500),
  return_date: isoDate,
  document_url: optStr(500),
  document_key: optStr(255),
  tax_rate_id: uuid.optional().nullable(),   // tax is computed server-side from the rate
  items: z.array(z.object({
    product_id: uuid,
    // The unit the goods were PURCHASED in (e.g. Dozen). `quantity` counts whole
    // purchase units of it. May be omitted only when this supplier sold the
    // product here in exactly one unit; otherwise the server 400s as ambiguous.
    unit_id: uuid.optional().nullable(),
    quantity: z.coerce.number().int().positive('Return quantity must be a positive whole number'),
  })).min(1, 'Add at least one product to return'),
});

// Return goods to a supplier against a received purchase.
const PurchaseReturnSchema = z.object({
  reference: optStr(100),
  notes: optStr(500),
  return_date: isoDate,
  document_url: optStr(500),   // debit-note scan, uploaded via /upload/file
  document_key: optStr(255),
  items: z.array(z.object({
    po_item_id: uuid,
    quantity: z.coerce.number().int().positive('Return quantity must be a positive whole number'),
  })).min(1, 'Add at least one line to return'),
});

// ── Suppliers ─────────────────────────────────────────────────────────────────
const SupplierSchema = z.object({
  name: shortStr(255),
  contact_person: optStr(255),
  phone,
  whatsapp: phone,
  email: email.optional().nullable(),
  tax_number: optStr(100),
  country: optStr(100),
  city: optStr(100),
  address: optStr(500),
  payment_terms: nonNegInt.default(0),
  // Blank stays blank so the route can inherit Business Settings' default.
  credit_limit: z.preprocess((v) => (v === '' || v == null ? undefined : v), money.optional()),
  currency: z.string().length(3).default('USD'),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  is_blacklisted: z.boolean().default(false),
  blacklist_reason: optStr(500),
  contact_kind: z.enum(['individual', 'business']).optional(),
  assigned_to_id: uuid.optional().nullable(),
  opening_balance: money.optional(),
  custom_values: z.record(z.string().max(64), z.string().max(500)).optional().nullable(),
  notes: optStr(2000),
});

const SupplierCommSchema = z.object({
  type: z.enum(['call','email','whatsapp','meeting','other']),
  subject: optStr(255),
  notes: optStr(2000),
});

const SupplierProductSchema = z.object({
  product_id: uuid,
  supplier_sku: optStr(100),
  unit_price: money,
  min_order_qty: positiveInt.default(1),
  lead_time_days: nonNegInt.default(0),
  is_preferred: z.boolean().default(false),
});

// ── Stock ─────────────────────────────────────────────────────────────────────
const AdjustmentSchema = z.object({
  product_id: uuid,
  location_id: uuid,
  type: z.enum(['write_off','loss','theft','damage','promo','correction','expiry','found']),
  quantity: z.coerce.number().int().refine(v => v !== 0, 'Quantity cannot be zero'),
  reason: optStr(500),
  photo_url: optStr(500),
});

// Document-style stock adjustment: one header, priced lines. Quantities are
// REMOVED from stock on save (Normal = routine leakage; Abnormal = exceptional
// loss), with an optional recovered amount netting the expense.
const AdjustmentDocSchema = z.object({
  location_id: uuid,
  ref_no: optStr(50),
  adjustment_date: optStr(40).refine((s) => !s || !Number.isNaN(Date.parse(s)), 'Invalid adjustment date'),
  type: z.enum(['normal', 'abnormal']),
  // Bounded so a fat-fingered value 422s here instead of overflowing the
  // DECIMAL(12,2) column inside Prisma as a 500.
  total_recovered: z.coerce.number().min(0).max(99999999.99).optional(),
  reason: optStr(1000),
  items: z.array(z.object({
    product_id: uuid,
    qty: positiveInt.max(1000000),
    unit_price: z.coerce.number().min(0).max(99999999.99).optional(),
  })).min(1),
}).refine((d) => new Set(d.items.map((i) => i.product_id)).size === d.items.length, {
  message: 'Each product may appear on the document only once',
});

const TransferSchema = z.object({
  from_location_id: uuid,
  to_location_id: uuid,
  ref_no: optStr(50),
  // Must parse — an Invalid Date would blow up inside Prisma as a 500.
  transfer_date: optStr(40).refine((s) => !s || !Number.isNaN(Date.parse(s)), 'Invalid transfer date'),
  // Stock leaves the source at in_transit and lands at the destination on completed.
  status: z.enum(['pending', 'in_transit', 'completed']).optional(),
  shipping_charges: z.coerce.number().min(0).max(99999999.99).optional(),
  notes: optStr(1000),
  items: z.array(z.object({
    product_id: uuid,
    qty: positiveInt.max(1000000),
    unit_price: z.coerce.number().min(0).max(99999999.99).optional(),
  })).min(1),
}).refine(d => d.from_location_id !== d.to_location_id, {
  message: 'From and to locations must be different',
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
const TaskSchema = z.object({
  title: shortStr(255),
  description: optStr(2000),
  category: z.enum(['other','delivery','maintenance','admin','purchase','quality','hr','finance']).default('other'),
  priority: z.enum(['critical','high','medium','low']).default('medium'),
  status: z.enum(['not_started','in_progress','blocked','completed','cancelled']).default('not_started'),
  assignee_id: uuid.optional().nullable(),
  due_date: isoDate,
  project_id: uuid.optional().nullable(),
  milestone_id: uuid.optional().nullable(),
  blocked_reason: optStr(500),
  is_recurring: z.boolean().default(false),
  recurrence: z.enum(['daily','weekly','monthly']).optional().nullable(),
  notes: optStr(2000),
});

const CommentSchema = z.object({
  comment: z.string().trim().min(1).max(2000),
});

// ── Projects ──────────────────────────────────────────────────────────────────
const ProjectSchema = z.object({
  name: shortStr(255),
  description: optStr(2000),
  category: optStr(100),
  status: z.enum(['planning','active','on_hold','completed','cancelled']).default('planning'),
  owner_id: uuid.optional().nullable(),
  start_date: isoDate,
  target_date: isoDate,
  budget: money.default(0),
  notes: optStr(2000),
});

const MilestoneSchema = z.object({
  name: shortStr(255),
  description: optStr(1000),
  owner_id: uuid.optional().nullable(),
  due_date: isoDate,
  status: z.enum(['pending','in_progress','completed','overdue']).default('pending'),
  order_index: nonNegInt.default(0),
});

// ── Users ─────────────────────────────────────────────────────────────────────
const commissionPct = z.coerce.number().min(0).max(100).optional();

const CreateUserSchema = z.object({
  name: shortStr(255),
  email,
  password: z.string().min(8).max(128),
  role: z.enum(['owner','manager','cashier','warehouse']).default('cashier'),
  pin: z.string().regex(/^\d{4,10}$/, 'PIN must be 4-10 digits').optional().nullable(),
  commission_percent: commissionPct,
});

const UpdateUserSchema = z.object({
  name: shortStr(255),
  role: z.enum(['owner','manager','cashier','warehouse']),
  is_active: z.boolean(),
  pin: z.string().regex(/^\d{4,10}$/).optional().nullable(),
  commission_percent: commissionPct,
});

const CommissionSettingsSchema = z.object({
  calculation_type: z.enum(['invoice_value', 'payment_received']).optional(),
  agent_type:       z.enum(['logged_in_user', 'select_from_users', 'select_from_agents']).optional(),
});

// ── HRM ─────────────────────────────────────────────────────────────────────
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const EmployeeSchema = z.object({
  name:               shortStr(255),
  email:              optStr(255),
  department:         optStr(100),
  designation:        optStr(100),
  location_id:        uuid.optional().nullable(),
  salary:             money.default(0),
  joined:             isoDate,
  user_id:            uuid.optional().nullable(),
  commission_percent: z.coerce.number().min(0).max(100).optional(),
});
// Editing an employee — every field optional, only what is sent is written.
const EmployeeUpdateSchema = z.object({
  name:               shortStr(255).optional(),
  email:              optStr(255),
  department:         optStr(100),
  designation:        optStr(100),
  location_id:        uuid.optional().nullable(),
  salary:             money.optional(),
  joined:             isoDate,
  user_id:            uuid.optional().nullable(),
  commission_percent: z.coerce.number().min(0).max(100).optional(),
  // Employment state. "On leave" is derived from approved leave, not set here.
  status:             z.enum(['active', 'inactive']).optional(),
});
const OrgUnitSchema = z.object({
  kind: z.enum(['department', 'designation']),
  name: shortStr(100),
});
const HrmSettingsSchema = z.object({
  work_start:     hhmm.optional(),
  grace_minutes:  z.coerce.number().int().min(0).max(120).optional(),
  // The clock every attendance timestamp is written and read against.
  timezone:       shortStr(64).optional(),
  standard_hours: z.coerce.number().min(0).max(24).optional(),
  half_day_hours: z.coerce.number().min(0).max(24).optional(),
  // These four drive the payroll math and were previously writable by nothing,
  // pinning every tenant to 1.5x overtime and a 26-day month.
  overtime_rate:  z.coerce.number().min(0).max(10).optional(),
  working_days:   z.coerce.number().int().min(1).max(31).optional(),
  late_deduction: money.optional(),
  // Either the literal 'day' (deduct a day's pay) or a fixed amount.
  absent_deduction: z.union([z.literal('day'), z.coerce.number().min(0)])
    .transform(v => String(v)).optional(),
});
const EmployeeShiftSchema = z.object({
  type:  z.enum(['fixed', 'flexible']).default('fixed'),
  start: hhmm.optional(),
  end:   hhmm.optional(),
});
const AttendanceClockSchema = z.object({
  employee_id: uuid,
  at:          hhmm.optional(),
  date:        isoDate,
});
const LeaveTypeSchema = z.object({
  name:         shortStr(100),
  default_days: z.coerce.number().int().min(0).default(0),
  accrues:      z.coerce.boolean().default(false),
  paid:         z.coerce.boolean().default(true),
});
const LeaveTypeUpdateSchema = z.object({
  default_days: z.coerce.number().int().min(0).optional(),
  accrues:      z.coerce.boolean().optional(),
  paid:         z.coerce.boolean().optional(),
});
const LeaveSchema = z.object({
  employee_id: uuid,
  type:        shortStr(100),
  // Required. They used to be optional and silently defaulted to today, so a
  // 30-day request could be stored as a same-day one while still burning 30
  // days of entitlement.
  from:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  to:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  days:        z.coerce.number().int().positive().default(1),
  reason:      optStr(500),
}).refine(v => v.to >= v.from, { message: 'End date cannot be before the start date.', path: ['to'] });
const LeaveStatusSchema = z.object({
  status:      z.enum(['pending', 'approved', 'rejected']),
  approved_by: optStr(255),
});
const LeaveOverrideSchema = z.object({
  overrides: z.record(z.coerce.number().int().min(0).nullable()),
});
const RosterShiftSchema = z.object({
  employee_id: uuid,
  location_id: uuid.optional().nullable(),
  date:        isoDate,
  start:       hhmm,
  end:         hhmm,
  role:        optStr(100),
});
const RosterSwapSchema = z.object({
  shift_id: uuid,
  to_id:    uuid,
  reason:   optStr(500),
});
const HrAdvanceSchema = z.object({
  employee_id: uuid,
  amount:      money.refine(v => v > 0, 'Amount must be greater than 0'),
  date:        isoDate,
  account_id:  uuid.optional().nullable(),
  note:        optStr(500),
});
const HrTodoSchema = z.object({
  title:       shortStr(255),
  assigned_to: uuid.optional().nullable(),
  priority:    z.enum(['high', 'medium', 'low']).default('medium'),
  due:         isoDate,
});
const StatusSchema = z.object({ status: z.string().trim().min(1).max(20) });
const PayrollSchema = z.object({
  employee_id: uuid,
  month:       z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  basic:       money.default(0),
  allowance:   money.default(0),
  overtime:    money.default(0),
  bonus:       money.default(0),
  incentive:   money.default(0),
  // Genuine withholding only. Advance repayment is a separate instruction —
  // see advance_recovery — so that typing a tax deduction cannot silently
  // settle someone's outstanding loan.
  deduction:   money.default(0),
  advance_recovery: money.default(0),
  // Optional: auto-compute statutory deductions for this country (e.g. 'KE').
  statutory_country: z.enum(['KE', 'SO', 'none']).optional(),
  // Pro-rate the basic for a mid-month joiner (by days worked in the month).
  prorate:     z.boolean().optional().default(false),
});
const PackageSchema = z.object({
  name:      shortStr(100),
  price:     money.default(0),
  interval:  z.enum(['monthly', 'yearly']).default('monthly'),
  locations: z.coerce.number().int().min(0).default(1),
  users:     z.coerce.number().int().min(0).default(1),
  products:  z.coerce.number().int().min(0).default(100),
  featured:  z.coerce.boolean().default(false),
});
const ServiceTypeSchema = z.object({
  name:                shortStr(100),
  packing_charge:      money.default(0),
  packing_charge_type: z.enum(['fixed', 'percentage']).default('fixed'),
  enabled:             z.coerce.boolean().optional(),
});
const PayslipSettingsSchema = z.object({
  show_attendance:          z.coerce.boolean().optional(),
  show_overtime:            z.coerce.boolean().optional(),
  show_leave:               z.coerce.boolean().optional(),
  show_advance:             z.coerce.boolean().optional(),
  show_bonus:               z.coerce.boolean().optional(),
  show_incentive:           z.coerce.boolean().optional(),
  show_deduction_breakdown: z.coerce.boolean().optional(),
});

// ── Settings ──────────────────────────────────────────────────────────────────
// UltimatePOS-style Business Settings preference bag. Every field optional so
// partial saves work; the route shallow-merges into the stored settings JSON.
// Every key here is honoured somewhere in the app. Keys that had no consumer
// (enable_inline_tax, the sub-category/sub-unit/rack/row/position/
// warranty/expiry toggles, and LIFO) were removed rather than stored inertly.
const BusinessSettingsBag = z.object({
  start_date: isoDate,                                    // reports lower bound
  fy_start_month: z.coerce.number().int().min(1).max(12), // P&L financial-year presets
  currency_symbol_placement: z.enum(['before', 'after']),  // money()
  transaction_edit_days: z.coerce.number().int().min(0).max(3650), // edit-window guard
  date_format: z.enum(['mm/dd/yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd', 'dd-mm-yyyy', 'mm-dd-yyyy']),
  time_format: z.enum(['12', '24']),
  currency_precision: z.coerce.number().int().min(0).max(4),  // money()
  quantity_precision: z.coerce.number().int().min(0).max(4),  // qty()
  default_profit_percent: z.coerce.number().min(0).max(100000), // seeds selling price
  timezone: optStr(64),
  // Tax — label the registration numbers on receipts
  tax1_name: optStr(60),
  tax2_name: optStr(60),
  tax2_number: optStr(100),
  // Product form
  sku_prefix: optStr(20),
  enable_brands: z.boolean(),
  enable_categories: z.boolean(),
  enable_price_tax: z.boolean(),
  product_image_required: z.boolean(),
  default_unit_id: z.string().uuid().nullable(),
  // ── Contact ────────────────────────────────────────────────────────────────
  default_credit_limit: z.coerce.number().min(0).max(999999999).nullable(),
  // ── Sale ───────────────────────────────────────────────────────────────────
  default_sale_discount: z.coerce.number().min(0).max(100),
  default_sale_tax: z.string().uuid().nullable(),            // tax rate id
  default_sale_tax_rate: z.coerce.number().min(0).max(1),    // its fraction, denormalised for the till
  sales_item_addition_method: z.enum(['increase', 'new_line']),
  amount_rounding_method: z.enum(['none', 'whole', '0.05', '0.1', '0.5']),
  sales_price_is_minimum: z.boolean(),
  allow_overselling: z.boolean(),
  enable_sales_order: z.boolean(),
  is_pay_term_required: z.boolean(),
  sales_commission_agent: z.enum(['disable', 'logged_in', 'select']),
  commission_calculation_type: z.enum(['invoice_value', 'payment_received']),
  is_commission_agent_required: z.boolean(),
  enable_payment_link: z.boolean(),
  // PUBLIC identifiers only. Processor SECRET keys must never enter this bag:
  // GET /settings returns it to every authenticated user and the frontend
  // persists it in localStorage.
  razorpay_key_id: optStr(120),
  stripe_public_key: optStr(120),
  // ── POS ────────────────────────────────────────────────────────────────────
  pos_shortcuts: z.record(z.string().max(40), z.string().max(40)).nullable(),
  pos_disable_multiple_pay: z.boolean(),
  pos_disable_draft: z.boolean(),
  pos_disable_express_checkout: z.boolean(),
  pos_hide_product_suggestion: z.boolean(),
  pos_hide_recent_transactions: z.boolean(),
  pos_disable_discount: z.boolean(),
  pos_disable_order_tax: z.boolean(),
  pos_subtotal_editable: z.boolean(),
  pos_disable_suspend: z.boolean(),
  pos_enable_transaction_date: z.boolean(),
  pos_service_staff_required: z.boolean(),
  pos_enable_service_staff_in_line: z.boolean(),
  pos_disable_credit_sale: z.boolean(),
  pos_enable_weighing_scale: z.boolean(),
  pos_show_invoice_scheme: z.boolean(),
  pos_show_invoice_layout: z.boolean(),
  pos_print_on_suspend: z.boolean(),
  pos_show_pricing_tooltip: z.boolean(),
  scale_prefix: optStr(10),
  scale_sku_length: z.coerce.number().int().min(1).max(10),
  scale_qty_int_length: z.coerce.number().int().min(1).max(6),
  scale_qty_frac_length: z.coerce.number().int().min(0).max(4),
  // ── Display Screen ─────────────────────────────────────────────────────────
  display_enabled: z.boolean(),
  display_heading: optStr(2000),
  display_images: z.array(z.string().max(500)).max(10).nullable(),
  // ── Purchases ──────────────────────────────────────────────────────────────
  purchases_edit_price: z.boolean(),
  purchases_enable_status: z.boolean(),
  purchases_enable_lot: z.boolean(),
  purchases_enable_po: z.boolean(),
  purchases_enable_requisition: z.boolean(),
  // ── Payment ────────────────────────────────────────────────────────────────
  cash_denominations: optStr(200),
  cash_denomination_on: z.enum(['pos', 'all']),
  cash_denomination_methods: optStr(200),
  cash_denomination_strict: z.boolean(),
  // ── Dashboard ──────────────────────────────────────────────────────────────
  stock_expiry_alert_days: z.coerce.number().int().min(1).max(365),
  // ── System ─────────────────────────────────────────────────────────────────
  // Prefixes for auto-generated reference numbers (wired: purchase, transfer,
  // adjustment, expense; the rest stored for their future generators).
  prefix_purchase: optStr(8), prefix_purchase_return: optStr(8), prefix_stock_transfer: optStr(8),
  prefix_stock_adjustment: optStr(8), prefix_sell_return: optStr(8), prefix_expense: optStr(8),
  prefix_contact: optStr(8), prefix_purchase_payment: optStr(8), prefix_sell_payment: optStr(8),
  prefix_business_location: optStr(8), prefix_draft: optStr(8), prefix_sales_order: optStr(8),
  notification_templates: z.record(z.string().max(40), z.object({
    subject: z.string().max(200), cc: z.string().max(200), bcc: z.string().max(200),
    email_body: z.string().max(5000), sms_body: z.string().max(1000), whatsapp: z.string().max(1000),
  }).partial()).nullable(),
  theme_color: optStr(20),
  datatable_entries: z.coerce.number().int().min(10).max(200),
  show_help_text: z.boolean(),
}).partial();

const SettingsSchema = z.object({
  name: shortStr(200),
  phone,
  address: optStr(500),
  city: optStr(100),
  country: optStr(100),
  currency: z.string().length(3),
  receipt_header: optStr(500),
  receipt_footer: optStr(500),
  tax_number: optStr(100),
  language: z.enum(['en', 'so', 'ar']).optional(),
  settings: BusinessSettingsBag.optional(),
});

// ── Receipt printers ──────────────────────────────────────────────────────────
// Only a network printer has an address; Windows/Linux printers go through a
// local spooler, so their IP/port are ignored (and stored NULL).
const HOST_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
const ipv4Octets = (h) => !/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.split('.').every((o) => Number(o) <= 255);

const ReceiptPrinterSchema = z.object({
  name: shortStr(120),
  connection_type: z.enum(['network', 'windows', 'linux']).default('network'),
  capability_profile: z.enum(['default', 'simple', 'sp2000', 'tep200m', 'p822d']).default('default'),
  // 58mm paper is ~32 chars, 80mm is ~42-48. Guard the ESC/POS layout maths.
  characters_per_line: z.coerce.number().int().min(24).max(64),
  ip_address: optStr(120),
  port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  is_default: z.boolean().default(false),
}).superRefine((d, ctx) => {
  if (d.connection_type !== 'network') return;
  if (!d.ip_address) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_address'], message: 'IP address is required for a network printer' });
  } else if (!HOST_RE.test(d.ip_address) || !ipv4Octets(d.ip_address)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_address'], message: 'Enter a valid IP address or hostname' });
  }
  if (!d.port) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['port'], message: 'Port is required for a network printer (most printers use 9100)' });
  }
});

// ── Barcode sticker sheet ─────────────────────────────────────────────────────
// Lengths are inches. A continuous-feed roll has no sheet, so paper size and
// stickers-per-sheet only apply (and are only required) for sheet stock.
const inches = z.coerce.number().min(0).max(100);
const BarcodeSettingSchema = z.object({
  name: shortStr(120),
  description: optStr(500),
  is_continuous: z.boolean().default(false),
  top_margin: inches.default(0),
  left_margin: inches.default(0),
  sticker_width: inches.refine(v => v > 0, 'Sticker width must be greater than 0'),
  sticker_height: inches.refine(v => v > 0, 'Sticker height must be greater than 0'),
  paper_width: inches.optional().nullable(),
  paper_height: inches.optional().nullable(),
  stickers_in_one_row: z.coerce.number().int().min(1).max(20),
  row_distance: inches.default(0),
  col_distance: inches.default(0),
  stickers_per_sheet: z.coerce.number().int().min(0).max(500).default(0),
  is_default: z.boolean().default(false),
}).superRefine((d, ctx) => {
  if (d.is_continuous) return;   // rolls: no sheet geometry to validate
  const need = (field, label) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${label} is required for sheet stock` });
  if (!d.paper_width) need('paper_width', 'Paper width');
  if (!d.paper_height) need('paper_height', 'Paper height');
  if (!d.stickers_per_sheet) need('stickers_per_sheet', 'Stickers per sheet');
  // The row must physically fit the paper.
  if (d.paper_width && d.sticker_width) {
    const used = d.left_margin + d.stickers_in_one_row * d.sticker_width + (d.stickers_in_one_row - 1) * d.col_distance;
    if (used > d.paper_width + 0.001) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stickers_in_one_row'], message: `${d.stickers_in_one_row} stickers of ${d.sticker_width}" need ${used.toFixed(2)}" but the paper is ${d.paper_width}" wide` });
    }
  }
});

const CategorySchema = z.object({
  name: shortStr(100),
  code: optStr(50),           // category / HSN code
  description: optStr(500),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code').optional().nullable(),
  parent_id: uuid.optional().nullable(), // sub-taxonomy parent
});

const LocationSchema = z.object({
  name: shortStr(255),
  type: z.enum(['warehouse','store','branch']).default('warehouse'),
  address: optStr(500),
  is_active: z.boolean().default(true),
  // Contact / address
  location_code: optStr(50),
  landmark: optStr(255),
  city: optStr(120),
  zip_code: optStr(30),
  state: optStr(120),
  country: optStr(120),
  mobile: optStr(40),
  alt_contact: optStr(40),
  email: optStr(255),
  website: optStr(255),
  // Manager (a team member) + invoicing / pricing references
  manager_id: uuid.optional().nullable(),
  invoice_scheme_id: uuid.optional().nullable(),
  invoice_layout_id: uuid.optional().nullable(),
  price_group_id: uuid.optional().nullable(),
  // Custom fields
  custom_field1: optStr(255),
  custom_field2: optStr(255),
  custom_field3: optStr(255),
  custom_field4: optStr(255),
  // POS featured products + per-location payment config
  featured_product_ids: z.array(uuid).max(100).optional(),
  payment_methods: z.array(z.string().trim().min(1).max(30)).max(30).optional(),
  default_payment: optStr(30),
  payment_accounts: z.record(z.string(), uuid.nullable()).optional().nullable(),
});

const CustomerSchema = z.object({
  custom_values: z.record(z.string().max(64), z.string().max(500)).optional().nullable(),
  name: shortStr(255),
  phone,
  whatsapp: phone,
  email: email.optional().nullable(),
  tax_number: optStr(100),
  address: optStr(500),
  credit_limit: money.default(0),
  customer_group_id: uuid.optional().nullable(),
  price_group_id: uuid.optional().nullable(),
  wholesale_terms_days: z.coerce.number().int().min(0).max(365).optional(),
  contact_kind: z.enum(['individual', 'business']).optional(),
  assigned_to_id: uuid.optional().nullable(),
  opening_balance: money.optional(),
  notes: optStr(2000),
});

const CustomerGroupSchema = z.object({
  name:   shortStr(255),
  amount: z.coerce.number().min(-100).max(1000).default(0),  // pricing %: negative = discount
});

const CommissionAgentSchema = z.object({
  prefix:             optStr(10),
  first_name:         shortStr(100),
  last_name:          optStr(100),
  email:              optStr(255),
  phone:              optStr(40),
  address:            optStr(1000),
  commission_percent: z.coerce.number().min(0).max(100).default(0),
  is_active:          z.boolean().optional(),
});

const UnitSchema = z.object({
  actual_name:   shortStr(100),
  short_name:    shortStr(20),
  allow_decimal: z.coerce.boolean().default(false),
  // "Multiple of other unit": 1 of this unit = base_multiplier × base unit.
  // Whole multiples only. Base stock is counted in integers (stock_levels.quantity
  // and cost_layers.quantity_remaining are both Int), so "1 Roll = 2.5 m" cannot be
  // held, received or returned without rounding — which would misstate the ledger.
  base_unit_id:    uuid.optional().nullable(),
  base_multiplier: z.coerce.number().int('A unit must be a whole multiple of its base unit').positive().max(1000000).optional().nullable(),
});

const BrandSchema = z.object({
  name: shortStr(255),
  description: optStr(500),         // short description
  use_for_repair: z.boolean().optional(),
});

const PriceGroupSchema = z.object({
  name:    shortStr(255),
  percent: z.coerce.number().min(-100).max(1000).default(0),
});

const InvoiceLayoutSchema = z.object({
  name:                shortStr(255),
  design:              z.enum(['classic', 'elegant', 'slim']).optional(),
  header_text:         optStr(500),
  footer_text:         optStr(500),
  show_address:        z.coerce.boolean().optional(),
  show_tax_summary:    z.coerce.boolean().optional(),
  show_total_in_words: z.coerce.boolean().optional(),
  show_discount:       z.coerce.boolean().optional(),
  show_qr:             z.coerce.boolean().optional(),
  show_letterhead:     z.coerce.boolean().optional(),
  hide_prices:         z.coerce.boolean().optional(),
  is_default:          z.coerce.boolean().optional(),
  config:              z.record(z.any()).optional().nullable(), // extended layout settings (labels, toggles, QR, credit-note)
});

const InvoiceSchemeSchema = z.object({
  name:          shortStr(255),
  prefix:        optStr(20),
  start_number:  z.coerce.number().int().min(0).default(1),
  total_digits:  z.coerce.number().int().min(1).max(12).default(4),
  numbering_type: z.enum(['sequential', 'aleatory']).default('sequential'),
  include_year:  z.boolean().default(false),
});

const DiscountSchema = z.object({
  name:                  shortStr(255),
  type:                  z.enum(['percentage', 'fixed']).default('percentage'),
  value:                 money.default(0),
  priority:              z.coerce.number().int().min(0).default(1),
  category:              optStr(100),
  brand_id:              uuid.optional().nullable(),
  location_id:           uuid.optional().nullable(),
  starts_at:             isoDate,
  ends_at:               isoDate,
  apply_price_groups:    z.coerce.boolean().default(true),
  apply_customer_groups: z.coerce.boolean().default(false),
  is_active:             z.coerce.boolean().default(true),
});

const VariationTemplateSchema = z.object({
  name:   shortStr(100),
  values: z.array(z.string().trim().min(1).max(100)).default([]),
});

// The reference's full expense document. Kept a SUPERSET of the old shape
// (payment_status/date/expense_for) so pre-existing clients keep working:
// payment_status 'paid' maps to a full cash payment, 'due' to none.
const ExpenseSchema = z.object({
  category_id:    uuid.optional().nullable(),
  sub_category_id: uuid.optional().nullable(),
  location_id:    uuid.optional().nullable(),
  title:          optStr(255),
  payment_to:     optStr(255),
  ref_no:         optStr(50),
  amount:         money.refine(v => v > 0, 'Amount must be greater than 0').refine(v => v <= 99999999.99, 'Amount is too large'),
  date:           optStr(40).refine((s) => !s || !Number.isNaN(Date.parse(s)), 'Invalid date'),
  // default('paid') preserved from the old schema: a legacy body that omits it
  // must keep booking as fully paid, exactly as before. The new editor always
  // sends either a payment object or an explicit 'due'.
  payment_status: z.enum(['paid', 'due']).default('paid'),
  expense_for:    optStr(255),
  expense_for_user_id: uuid.optional().nullable(),
  contact_id:     uuid.optional().nullable(),
  tax_rate_id:    uuid.optional().nullable(),
  note:           optStr(2000),
  is_refund:      z.boolean().default(false),
  receipt_url:    z.string().url().optional().nullable(), // snapped receipt photo
  document_url:   optStr(500),
  document_key:   optStr(255),
  is_recurring:   z.boolean().optional(),
  recur_interval:      positiveInt.max(3650).optional().nullable(),
  recur_interval_type: z.enum(['days', 'weeks', 'months', 'years']).optional().nullable(),
  recur_repetitions:   positiveInt.max(1000).optional().nullable(),
  // The "Add payment" section — one initial tender against the document.
  payment: z.object({
    amount:  z.coerce.number().min(0).max(99999999.99),
    // Whitelisted: an unknown method would silently post to the wrong GL
    // account ('credit', for instance, maps to Accounts Receivable).
    method:  z.enum(['cash', 'zaad', 'evc', 'card', 'bank', 'cheque', 'other']).optional().nullable(),
    payment_account_id: uuid.optional().nullable(),
    paid_on: optStr(40).refine((s) => !s || !Number.isNaN(Date.parse(s)), 'Invalid payment date'),
    note:    optStr(500),
  }).optional().nullable(),
});

const ExpensePaymentSchema = z.object({
  amount:  z.coerce.number().positive('Payment amount must be greater than zero').max(99999999.99),
  method:  z.enum(['cash', 'zaad', 'evc', 'card', 'bank', 'cheque', 'other']).optional().nullable(),
  payment_account_id: uuid.optional().nullable(),
  paid_on: optStr(40).refine((s) => !s || !Number.isNaN(Date.parse(s)), 'Invalid payment date'),
  note:    optStr(500),
});

// One expense per spreadsheet row; lenient strings (truncate, don't reject) so
// one long cell can't sink the batch — bad rows fail individually server-side.
const impStr2 = (max) => z.coerce.string().trim().transform((v) => v.slice(0, max)).optional().nullable();
const ExpenseImportSchema = z.object({
  rows: z.array(z.object({
    location:       impStr2(255),
    category:       impStr2(255),
    sub_category:   impStr2(255),
    ref_no:         impStr2(50),
    date:           impStr2(40),
    expense_for:    impStr2(255),
    contact_id:     impStr2(64),
    tax:            impStr2(100),
    note:           impStr2(2000),
    total_amount:   z.coerce.number().optional().nullable(),
    paid_amount:    z.coerce.number().optional().nullable(),
    paid_on:        impStr2(40),
    payment_method: impStr2(30),
  })).min(1, 'Nothing to import').max(1000, 'Import at most 1000 expenses at a time'),
});

const ExpenseCategorySchema = z.object({
  name: shortStr(255),
  code: optStr(50),
  parent_id: uuid.optional().nullable(),
});

const PaymentAccountSchema = z.object({
  name:           shortStr(255),
  // No default: an EDIT that omits the legacy kind must keep the stored one,
  // not silently reset it to Cash. Create fills 'Cash' in the route.
  type:           z.enum(['Cash', 'Bank', 'Mobile money', 'Other']).optional(),
  account_type_id: uuid.optional().nullable(),
  account_number: optStr(100),
  note:           optStr(1000),
  balance:        money.default(0), // opening balance; ignored on edit
});

const PaymentAccountTypeSchema = z.object({
  name: shortStr(255),
  parent_id: uuid.optional().nullable(),
});

const LinkPaymentSchema = z.object({
  payment_type: z.enum(['sell', 'expense', 'purchase', 'refund']),
  payment_id: uuid,
  account_id: uuid.optional().nullable(),
});

const AccountTransferSchema = z.object({
  from_id: uuid,
  to_id:   uuid,
  amount:  money.refine(v => v > 0, 'Amount must be greater than 0'),
}).refine(d => d.from_id !== d.to_id, { message: 'From and to accounts must differ' });

const AccountDepositSchema = z.object({
  amount: money.refine(v => v > 0, 'Amount must be greater than 0'),
  note: optStr(500),
});

const ProductVariantSchema = z.object({
  sku: optStr(100),
  barcode: optStr(100),
  attributes: z.record(z.string().max(100)).default({}),
  cost_price: money.default(0),
  selling_price: money.default(0),
  wholesale_price: money.default(0),
  is_active: z.boolean().default(true),
  sort_order: nonNegInt.default(0),
});

// Add opening stock — a location + per-line (variant) quantities & costs.
const OpeningStockSchema = z.object({
  location_id: uuid,
  lines: z.array(z.object({
    variant_id: uuid.optional().nullable(),
    quantity: nonNegInt,
    unit_cost: money.default(0),
    note: optStr(255),
  })).min(1),
});

// ── Pagination ────────────────────────────────────────────────────────────────
const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc','desc']).default('desc'),
});

// ── Phase 3 Schemas ───────────────────────────────────────────────────────────

const CouponSchema = z.object({
  code: z.string().trim().min(2).max(50).toUpperCase(),
  description: optStr(500),
  type: z.enum(['pct','flat','free_item']),
  value: money.refine(v => v > 0, 'Value must be greater than 0'),
  min_purchase: money.default(0),
  max_uses: z.coerce.number().int().positive().optional().nullable(),
  per_customer_limit: z.coerce.number().int().positive().default(1),
  valid_from: isoDate,
  valid_until: isoDate,
  is_active: z.boolean().default(true),
});

const ApplyCouponSchema = z.object({
  code: z.string().trim().min(1).max(50),
  subtotal: money,
});

const LoyaltyRuleSchema = z.object({
  points_per_dollar: z.coerce.number().positive().max(100).default(1),
  dollar_per_point: z.coerce.number().positive().max(1).default(0.01),
  min_redeem_points: z.coerce.number().int().nonnegative().default(100),
  is_active: z.boolean().default(true),
});

// Rich POS reward-settings config (stored as JSON on the loyalty rule).
// A cleared numeric input arrives as null (or ''), which z.coerce would
// silently turn into 0 — and 0 stored as amount_per_unit_point divides the
// POS points math into Infinity. Treat cleared as "not provided" so the
// default applies instead; the two rate fields must be strictly positive.
const rewardNum = (inner) => z.preprocess((v) => (v === null || v === '' ? undefined : v), inner);
const RewardSettingsSchema = z.object({
  enabled:                 z.coerce.boolean().optional(),
  display_name:            optStr(100),
  amount_per_unit_point:   rewardNum(z.coerce.number().positive().optional()),
  min_order_total_earn:    rewardNum(z.coerce.number().min(0).optional()),
  max_points_per_order:    z.coerce.number().min(0).nullable().optional(), // null = no cap
  redeem_amount_per_point: rewardNum(z.coerce.number().positive().optional()),
  min_order_total_redeem:  rewardNum(z.coerce.number().min(0).optional()),
  min_redeem_point:        rewardNum(z.coerce.number().int().min(0).optional()),
  max_redeem_point:        rewardNum(z.coerce.number().int().min(0).optional()),
  expiry_period:           rewardNum(z.coerce.number().int().min(0).optional()),
  expiry_type:             z.enum(['day', 'week', 'month', 'year']).optional(),
}).passthrough();

const PettyCashSchema = z.object({
  type: z.enum(['in','out']),
  amount: money.refine(v => v > 0, 'Amount must be greater than 0'),
  reason: z.string().trim().min(1).max(500),
  reference: optStr(100),
  shift_id: uuid.optional().nullable(),
  location_id: uuid.optional().nullable(),
});

const BundleSchema = z.object({
  name: shortStr(255),
  description: optStr(1000),
  selling_price: money.default(0),
  items: z.array(z.object({
    product_id: uuid,
    variant_id: uuid.optional().nullable(),
    quantity: positiveInt,
  })).min(1),
});

const ScheduledReportSchema = z.object({
  name: shortStr(255),
  report_type: z.enum(['sales','inventory','cashier','low_stock','profit']),
  frequency: z.enum(['daily','weekly','monthly']),
  send_time: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  day_of_week: z.coerce.number().int().min(0).max(6).optional().nullable(),
  day_of_month: z.coerce.number().int().min(1).max(31).optional().nullable(),
  recipients: z.array(z.string().email()).min(1),
  filters: z.record(z.any()).default({}),
  is_active: z.boolean().default(true),
});

const CustomerSegmentSchema = z.object({
  segment: z.enum(['vip','regular','new','dormant','credit_risk','wholesale']).optional().nullable(),
  whatsapp_opted_in: z.boolean().optional(),
  diaspora_currency: z.string().length(3).optional().nullable(),
});

const BarcodeJobSchema = z.object({
  product_ids: z.array(uuid).min(1).max(200),
  label_format: z.enum(['2x1inch','4x2inch','3x1.5inch']).default('2x1inch'),
});

const SupplierCatalogImportSchema = z.object({
  items: z.array(z.object({
    product_name: shortStr(255),
    supplier_sku: optStr(100),
    barcode: optStr(100),
    unit_price: money,
    currency: z.string().length(3).default('USD'),
    min_order_qty: z.coerce.number().int().positive().default(1),
    lead_time_days: z.coerce.number().int().nonnegative().default(0),
  })).min(1).max(500),
});

// ── SaleSchema v3 — full feature checkout ────────────────────────────────────
// Extends SaleSchema with: coupon, loyalty, tip, custom item, variants, serials
const SaleItemSchemaV3 = z.object({
  product_id: uuid,
  variant_id: uuid.optional().nullable(),
  quantity: positiveInt,
  override_price: money.optional().nullable(),
  notes: optStr(500),
  serial_numbers: z.array(z.string().min(1).max(255)).optional(),
  prescription_id: uuid.optional().nullable(), // pharmacy: links an Rx-only line to its prescription
});

const SaleSchemaV3 = z.object({
  // Optional at the schema layer so the checkout service can answer a missing
  // token with a clear domain 400 ("Transaction token required") rather than a
  // generic 422 — the token is still enforced (existence + sale_keys lookup).
  idempotency_key: z.string().min(10).max(256).optional(),
  items: z.array(SaleItemSchemaV3).default([]),
  variant_items: z.array(z.object({
    product_id: uuid,
    variant_id: uuid,
    quantity: positiveInt,
    override_price: money.optional().nullable(),
    notes: optStr(500),
    serial_numbers: z.array(z.string().min(1).max(255)).optional(),
  })).default([]),
  custom_item: z.object({
    name: shortStr(255),
    price: money,
    quantity: positiveInt.default(1),
  }).optional().nullable(),
  customer_id: uuid.optional().nullable(),
  location_id: uuid.optional().nullable(),
  // payment_method: any registered provider key ('cash','zaad','stripe','mpesa',...) or 'split'/'credit'
  // Validated at the registry level in checkout — not as an enum — to support pluggable providers.
  payment_method: z.string().min(1).max(50).default('cash'),
  // payments[]: optional multi-tender array for the new registry format
  // If omitted, payment_method + total is used (backwards compat)
  payments: z.array(z.object({
    method:    z.string().min(1).max(50),
    amount:    money,
    phone:     z.string().max(30).optional().nullable(),
    reference: z.string().max(128).optional().nullable(),
    tendered:  money.optional().nullable(),
  })).optional(),
  discount_type: z.enum(['pct','flat']).default('pct'),
  discount_value: money.default(0),
  cash_tendered: money.optional(),
  cash_amount: money.optional(),
  zaad_amount: money.optional(),
  card_amount: money.optional(),
  coupon_id: uuid.optional().nullable(),
  coupon_discount: money.default(0),
  loyalty_points_redeemed: nonNegInt.default(0),
  tip_amount: money.default(0),
  tip_type: z.enum(['pct','flat']).default('flat'),
  packing_charge: money.default(0),
  service_type_id: uuid.optional().nullable(),
  display_currency: z.string().length(3).optional().nullable(),
  notes: optStr(1000),
  type: z.enum(['pos','order','invoice','credit']).default('pos'),
  shift_id: uuid.optional().nullable(),
}).refine(d => {
  const hasItems = (d.items?.length ?? 0) > 0 || (d.variant_items?.length ?? 0) > 0 || d.custom_item != null;
  return hasItems;
}, { message: 'Cart must have at least one item' })
.refine(d => {
  // Split validation: either payments[] covers it, or the legacy split fields do
  if (d.payment_method === 'split' && !d.payments?.length) {
    return (d.cash_amount ?? 0) + (d.zaad_amount ?? 0) + (d.card_amount ?? 0) > 0;
  }
  return true;
}, { message: 'Split payment amounts must sum to more than zero' });

// ── Sale invoice ("Add Sale") ─────────────────────────────────────────────────
// A back-office sale document. `status` decides whether it posts: draft,
// quotation and proforma write the document only. Tax RATES are resolved
// server-side from tax_rate_id; a client-supplied percentage is never trusted.
// Accepts 'YYYY-MM-DD' as well as a full ISO timestamp.
const dateish = z.coerce.date().optional().nullable();

// The tenders a payment may actually arrive as. These are exactly the
// PaymentMethod enum members that name real money, so each one has an account
// in accounting.tenderAccountCode(). 'credit' is not a tender — an unpaid
// balance is expressed by leaving it unpaid — and 'split' is derived, not sent.
const TENDER_METHODS = ['cash', 'zaad', 'evc', 'edahab', 'mpesa', 'telebirr', 'cbe_birr', 'mobile_money', 'visa', 'mastercard'];

const SaleInvoicePaymentSchema = z.object({
  method: z.enum(TENDER_METHODS),
  amount: z.coerce.number().nonnegative(),
  payment_account_id: uuid.optional().nullable(),
  paid_on: dateish,
  note: optStr(500),
  tendered: z.coerce.number().nonnegative().optional().nullable(),
});

const SaleInvoiceSchema = z.object({
  location_id: uuid,
  customer_id: uuid.optional().nullable(),
  status: z.enum(['draft', 'quotation', 'proforma', 'completed']).default('completed'),
  sale_date: dateish,
  pay_term: z.coerce.number().int().nonnegative().max(3650).optional().nullable(),
  pay_term_period: z.enum(['days', 'months']).optional().nullable(),
  invoice_scheme_id: uuid.optional().nullable(),
  invoice_no: optStr(50),
  document_url: optStr(500),
  document_key: optStr(255),

  discount_type: z.enum(['pct', 'flat']).default('pct'),
  discount_value: z.coerce.number().nonnegative().default(0),
  tax_rate_id: uuid.optional().nullable(),   // order tax; the amount is computed
  // (a percentage over 100 is rejected below, not silently clamped)

  notes: optStr(1000),        // sell note — printed on the invoice
  staff_note: optStr(1000),   // internal

  shipping_details: optStr(1000),
  shipping_address: optStr(1000),
  shipping_charges: z.coerce.number().nonnegative().default(0),
  shipping_status: z.enum(['pending', 'packed', 'shipped', 'delivered', 'cancelled']).optional().nullable(),
  delivered_to: optStr(255),
  delivery_person_id: uuid.optional().nullable(),
  shipping_document_url: optStr(500),
  shipping_document_key: optStr(255),

  expenses: z.array(z.object({
    name: shortStr(255),
    amount: z.coerce.number().nonnegative(),
  })).max(20).default([]),

  items: z.array(z.object({
    product_id: uuid,
    variant_id: uuid.optional().nullable(),
    quantity: z.coerce.number().int().positive('Quantity must be a positive whole number'),
    unit_price: z.coerce.number().nonnegative().optional().nullable(),
    discount: z.coerce.number().nonnegative().default(0),   // flat, off the line total
    tax_rate_id: uuid.optional().nullable(),
  })).min(1, 'Add at least one product'),

  payments: z.array(SaleInvoicePaymentSchema).max(10).default([]),
}).refine((d) => d.discount_type !== 'pct' || d.discount_value <= 100, {
  message: 'A percentage discount cannot exceed 100%', path: ['discount_value'],
});

const SaleFinalizeSchema = z.object({
  payments: z.array(SaleInvoicePaymentSchema).max(10).default([]),
});

// Edit Shipping — logistics only. Deliberately cannot touch money, stock or the
// document itself, so it is safe on any sale, posted or not.
const SaleShippingSchema = z.object({
  shipping_details: optStr(1000),
  shipping_address: optStr(1000),
  shipping_status: z.enum(['pending', 'packed', 'shipped', 'delivered', 'cancelled']).optional().nullable(),
  shipping_note: optStr(1000),
  delivered_to: optStr(255),
  delivery_person_id: uuid.optional().nullable(),
  shipping_document_url: optStr(500),
  shipping_document_key: optStr(255),
});

// New Sale / Payment Received notification. Subject and body may carry
// {tags}; the server substitutes them from the sale itself, so the client
// cannot claim amounts the record does not hold.
const SaleNotifySchema = z.object({
  to: z.string().trim().email('A valid recipient email is required'),
  cc: z.string().trim().email().optional().nullable(),
  bcc: z.string().trim().email().optional().nullable(),
  subject: shortStr(200),
  body: shortStr(5000),
});

const SalePaymentSchema = SaleInvoicePaymentSchema.extend({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
});

// Bulk "Import Sales". The client parses the spreadsheet, groups the rows into
// invoices and posts them here — one object per invoice, each with its lines.
// Deliberately LENIENT: a bad quantity or unknown product must fail only its own
// invoice (reported per-row by the engine), never reject the whole batch here.
// `impStr` therefore TRUNCATES over-length text to the column width instead of
// rejecting it — one long cell must not 422 the entire import.
const impStr = (max) => z.coerce.string().trim().transform((s) => s.slice(0, max)).optional().nullable();
const SaleImportLineSchema = z.object({
  product_name: impStr(255),
  sku: impStr(100),
  quantity: z.coerce.number().optional().nullable(),
  unit_price: z.coerce.number().optional().nullable(),
  item_tax: z.coerce.number().optional().nullable(),
  discount: z.coerce.number().optional().nullable(),
  description: impStr(500),
});

const SaleImportInvoiceSchema = z.object({
  invoice_no: impStr(50),
  customer_name: impStr(255),
  customer_phone: impStr(50),
  customer_email: impStr(255),
  sale_date: impStr(40),
  location_id: uuid.optional().nullable(),
  order_total: z.coerce.number().optional().nullable(),
  items: z.array(SaleImportLineSchema).min(1, 'An invoice needs at least one line'),
});

const SaleImportSchema = z.object({
  location_id: uuid.optional().nullable(),
  paid: z.boolean().optional(),
  invoices: z.array(SaleImportInvoiceSchema).min(1, 'Nothing to import').max(1000, 'Import at most 1000 invoices at a time'),
});

module.exports = {
  SaleInvoiceSchema, SaleFinalizeSchema, SalePaymentSchema, TENDER_METHODS,
  SaleShippingSchema, SaleNotifySchema, SaleImportSchema,
  RegisterSchema, LoginSchema, PinLoginSchema, ChangePasswordSchema,
  RefreshTokenSchema, VerifyMfaSchema,
  ProductSchema, SaleSchema, SaleItemSchema, RefundSchema,
  ShiftOpenSchema, ShiftCloseSchema, HoldSaleSchema,
  PurchaseOrderSchema, PurchaseOrderUpdateSchema, POItemSchema, POStatusSchema, POPaymentSchema, PurchaseReturnSchema, PurchaseReturnCreateSchema,
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, AdjustmentDocSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
  ExpenseSchema, ExpenseCategorySchema, ExpensePaymentSchema, ExpenseImportSchema,
  PaymentAccountSchema, PaymentAccountTypeSchema, LinkPaymentSchema, AccountTransferSchema, AccountDepositSchema,
  BarcodeSettingSchema, ReceiptPrinterSchema,
  CustomerGroupSchema, UnitSchema, BrandSchema, VariationTemplateSchema, DiscountSchema,
  CommissionAgentSchema,
  PriceGroupSchema, InvoiceLayoutSchema, InvoiceSchemeSchema, CommissionSettingsSchema,
  EmployeeSchema, EmployeeUpdateSchema, OrgUnitSchema, HrmSettingsSchema, EmployeeShiftSchema, AttendanceClockSchema,
  LeaveTypeSchema, LeaveTypeUpdateSchema, LeaveSchema, LeaveStatusSchema, LeaveOverrideSchema,
  RosterShiftSchema, RosterSwapSchema, HrAdvanceSchema, HrTodoSchema, StatusSchema,
  PayrollSchema, PayslipSettingsSchema, PackageSchema, ServiceTypeSchema,
  PaginationSchema, ProductVariantSchema, OpeningStockSchema,
  CouponSchema, ApplyCouponSchema, LoyaltyRuleSchema, RewardSettingsSchema, PettyCashSchema,
  BundleSchema, ScheduledReportSchema, CustomerSegmentSchema,
  BarcodeJobSchema, SupplierCatalogImportSchema, SaleSchemaV3,
};
