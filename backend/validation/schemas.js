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
  unit_price: money,
  expiry_date: isoDate,
  batch_number: optStr(100),
  notes: optStr(500),
});

const PurchaseOrderSchema = z.object({
  supplier_id: uuid,
  location_id: uuid.optional().nullable(),
  items: z.array(POItemSchema).min(1),
  expected_delivery: isoDate,
  freight_cost: money.default(0),
  customs_duty: money.default(0),
  other_charges: money.default(0),
  payment_terms: nonNegInt.default(0),
  notes: optStr(2000),
  currency: z.string().length(3).default('USD'),
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
});

// ── Suppliers ─────────────────────────────────────────────────────────────────
const SupplierSchema = z.object({
  name: shortStr(255),
  contact_person: optStr(255),
  phone,
  whatsapp: phone,
  email: email.optional().nullable(),
  country: optStr(100),
  city: optStr(100),
  address: optStr(500),
  payment_terms: nonNegInt.default(0),
  credit_limit: money.default(0),
  currency: z.string().length(3).default('USD'),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  is_blacklisted: z.boolean().default(false),
  blacklist_reason: optStr(500),
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

const TransferSchema = z.object({
  from_location_id: uuid,
  to_location_id: uuid,
  notes: optStr(1000),
  items: z.array(z.object({
    product_id: uuid,
    qty: positiveInt,
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
const OrgUnitSchema = z.object({
  kind: z.enum(['department', 'designation']),
  name: shortStr(100),
});
const HrmSettingsSchema = z.object({
  work_start:     hhmm.optional(),
  grace_minutes:  z.coerce.number().int().min(0).max(120).optional(),
  standard_hours: z.coerce.number().min(0).max(24).optional(),
  half_day_hours: z.coerce.number().min(0).max(24).optional(),
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

// ── Settings ──────────────────────────────────────────────────────────────────
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
});

const CategorySchema = z.object({
  name: shortStr(100),
  description: optStr(500),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code').optional().nullable(),
});

const LocationSchema = z.object({
  name: shortStr(255),
  type: z.enum(['warehouse','store','branch']).default('warehouse'),
  address: optStr(500),
  is_active: z.boolean().default(true),
});

const CustomerSchema = z.object({
  name: shortStr(255),
  phone,
  whatsapp: phone,
  email: email.optional().nullable(),
  address: optStr(500),
  credit_limit: money.default(0),
  customer_group_id: uuid.optional().nullable(),
  notes: optStr(2000),
});

const CustomerGroupSchema = z.object({
  name:   shortStr(255),
  amount: z.coerce.number().min(-100).max(1000).default(0),  // pricing %: negative = discount
});

const UnitSchema = z.object({
  actual_name:   shortStr(100),
  short_name:    shortStr(20),
  allow_decimal: z.coerce.boolean().default(false),
});

const BrandSchema = z.object({ name: shortStr(255) });

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
});

const InvoiceSchemeSchema = z.object({
  name:         shortStr(255),
  prefix:       optStr(20),
  start_number: z.coerce.number().int().min(0).default(1),
  total_digits: z.coerce.number().int().min(1).max(12).default(4),
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

const ExpenseSchema = z.object({
  category_id:    uuid.optional().nullable(),
  location_id:    uuid.optional().nullable(),
  amount:         money.refine(v => v > 0, 'Amount must be greater than 0'),
  date:           isoDate,
  payment_status: z.enum(['paid', 'due']).default('paid'),
  expense_for:    optStr(255),
  note:           optStr(1000),
  is_refund:      z.boolean().default(false),
});

const ExpenseCategorySchema = z.object({ name: shortStr(255) });

const PaymentAccountSchema = z.object({
  name:           shortStr(255),
  type:           z.enum(['Cash', 'Bank', 'Mobile money', 'Other']).default('Cash'),
  account_number: optStr(100),
  balance:        money.default(0),
});

const AccountTransferSchema = z.object({
  from_id: uuid,
  to_id:   uuid,
  amount:  money.refine(v => v > 0, 'Amount must be greater than 0'),
}).refine(d => d.from_id !== d.to_id, { message: 'From and to accounts must differ' });

const AccountDepositSchema = z.object({
  amount: money.refine(v => v > 0, 'Amount must be greater than 0'),
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
});

const SaleSchemaV3 = z.object({
  idempotency_key: z.string().min(10).max(256),
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

module.exports = {
  RegisterSchema, LoginSchema, PinLoginSchema, ChangePasswordSchema,
  RefreshTokenSchema, VerifyMfaSchema,
  ProductSchema, SaleSchema, SaleItemSchema, RefundSchema,
  ShiftOpenSchema, ShiftCloseSchema, HoldSaleSchema,
  PurchaseOrderSchema, POItemSchema, POStatusSchema, POPaymentSchema,
  SupplierSchema, SupplierCommSchema, SupplierProductSchema,
  AdjustmentSchema, TransferSchema,
  TaskSchema, CommentSchema, ProjectSchema, MilestoneSchema,
  CreateUserSchema, UpdateUserSchema,
  SettingsSchema, CategorySchema, LocationSchema, CustomerSchema,
  ExpenseSchema, ExpenseCategorySchema,
  PaymentAccountSchema, AccountTransferSchema, AccountDepositSchema,
  CustomerGroupSchema, UnitSchema, BrandSchema, VariationTemplateSchema, DiscountSchema,
  PriceGroupSchema, InvoiceLayoutSchema, InvoiceSchemeSchema, CommissionSettingsSchema,
  EmployeeSchema, OrgUnitSchema, HrmSettingsSchema, EmployeeShiftSchema, AttendanceClockSchema,
  PaginationSchema, ProductVariantSchema,
  CouponSchema, ApplyCouponSchema, LoyaltyRuleSchema, PettyCashSchema,
  BundleSchema, ScheduledReportSchema, CustomerSegmentSchema,
  BarcodeJobSchema, SupplierCatalogImportSchema, SaleSchemaV3,
};
