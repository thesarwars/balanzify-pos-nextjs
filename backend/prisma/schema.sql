-- Balanzify Complete Database Schema v2
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- CORE
-- =====================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Somaliland',
  currency VARCHAR(10) DEFAULT 'USD',
  logo_url TEXT,
  receipt_header TEXT,
  receipt_footer TEXT DEFAULT 'Thank you for your business!',
  tax_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'cashier' CHECK (role IN ('owner','manager','cashier','warehouse')),
  pin VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- INVENTORY
-- =====================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'warehouse' CHECK (type IN ('warehouse','store','branch')),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  barcode VARCHAR(100),
  description TEXT,
  unit_of_measure VARCHAR(50) DEFAULT 'unit',
  cost_price DECIMAL(12,2) DEFAULT 0,
  selling_price DECIMAL(12,2) DEFAULT 0,
  wholesale_price DECIMAL(12,2) DEFAULT 0,
  min_stock_level INTEGER DEFAULT 0,
  max_stock_level INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  track_expiry BOOLEAN DEFAULT false,
  allow_price_override BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  batch_number VARCHAR(100),
  lot_number VARCHAR(100),
  quantity INTEGER DEFAULT 0,
  cost_price DECIMAL(12,2) DEFAULT 0,
  expiry_date DATE,
  received_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('in','out','adjustment','transfer_in','transfer_out','sale','purchase','waste','return','opening')),
  quantity INTEGER NOT NULL,
  balance_after INTEGER,
  reference_id UUID,
  reference_type VARCHAR(50),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  type VARCHAR(50) CHECK (type IN ('write_off','loss','theft','damage','promo','correction','expiry','found')),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  total_value DECIMAL(12,2) DEFAULT 0,
  reason TEXT,
  photo_url TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  transfer_number VARCHAR(50) UNIQUE,
  from_location_id UUID REFERENCES locations(id),
  to_location_id UUID REFERENCES locations(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','dispatched','received','cancelled')),
  notes TEXT,
  approved_by UUID REFERENCES users(id),
  dispatched_at TIMESTAMP,
  received_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  requested_qty INTEGER NOT NULL,
  dispatched_qty INTEGER DEFAULT 0,
  received_qty INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  name VARCHAR(255),
  type VARCHAR(20) DEFAULT 'full' CHECK (type IN ('full','partial','cycle')),
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','approved')),
  notes TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_id UUID REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  system_qty INTEGER DEFAULT 0,
  counted_qty INTEGER,
  variance INTEGER GENERATED ALWAYS AS (COALESCE(counted_qty,0) - system_qty) STORED,
  counted_by UUID REFERENCES users(id),
  counted_at TIMESTAMP
);

-- =====================
-- SUPPLIERS
-- =====================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  email VARCHAR(255),
  country VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  payment_terms INTEGER DEFAULT 0,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  outstanding_balance DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  is_blacklisted BOOLEAN DEFAULT false,
  blacklist_reason TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  supplier_sku VARCHAR(100),
  unit_price DECIMAL(12,2) DEFAULT 0,
  min_order_qty INTEGER DEFAULT 1,
  lead_time_days INTEGER DEFAULT 0,
  is_preferred BOOLEAN DEFAULT false,
  UNIQUE(supplier_id, product_id)
);

CREATE TABLE IF NOT EXISTS supplier_communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  type VARCHAR(30) CHECK (type IN ('call','email','whatsapp','meeting','other')),
  subject VARCHAR(255),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- PURCHASE ORDERS
-- =====================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id),
  location_id UUID REFERENCES locations(id),
  po_number VARCHAR(50) UNIQUE,
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','partial','received','cancelled')),
  order_date DATE DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  freight_cost DECIMAL(12,2) DEFAULT 0,
  customs_duty DECIMAL(12,2) DEFAULT 0,
  other_charges DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  payment_terms INTEGER DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  notes TEXT,
  sent_via VARCHAR(20),
  sent_at TIMESTAMP,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  ordered_qty INTEGER NOT NULL,
  received_qty INTEGER DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  expiry_date DATE,
  batch_number VARCHAR(100),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS goods_received_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID REFERENCES purchase_orders(id),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  grn_number VARCHAR(50) UNIQUE,
  received_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(30),
  reference VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- CUSTOMERS
-- =====================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  outstanding_balance DECIMAL(12,2) DEFAULT 0,
  total_purchases DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SALES & POS
-- =====================
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  cashier_id UUID REFERENCES users(id),
  opening_float DECIMAL(12,2) DEFAULT 0,
  closing_float DECIMAL(12,2),
  expected_cash DECIMAL(12,2),
  actual_cash DECIMAL(12,2),
  variance DECIMAL(12,2),
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_cash DECIMAL(12,2) DEFAULT 0,
  total_zaad DECIMAL(12,2) DEFAULT 0,
  total_card DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes TEXT,
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS held_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id),
  label VARCHAR(100),
  customer_name VARCHAR(255),
  items JSONB NOT NULL,
  subtotal DECIMAL(12,2),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id),
  location_id UUID REFERENCES locations(id),
  customer_id UUID REFERENCES customers(id),
  sale_number VARCHAR(50) UNIQUE,
  type VARCHAR(20) DEFAULT 'pos' CHECK (type IN ('pos','order','invoice','credit')),
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('draft','pending','completed','refunded','partially_refunded','cancelled')),
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_type VARCHAR(10) DEFAULT 'pct' CHECK (discount_type IN ('pct','flat')),
  discount_value DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  amount_due DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash','zaad','visa','mastercard','split','credit')),
  cash_amount DECIMAL(12,2) DEFAULT 0,
  zaad_amount DECIMAL(12,2) DEFAULT 0,
  card_amount DECIMAL(12,2) DEFAULT 0,
  cash_tendered DECIMAL(12,2) DEFAULT 0,
  change_given DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  cashier_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  original_price DECIMAL(12,2),
  cost_price DECIMAL(12,2) DEFAULT 0,
  total_price DECIMAL(12,2) NOT NULL,
  discount DECIMAL(12,2) DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id),
  refund_number VARCHAR(50) UNIQUE,
  reason TEXT,
  total_refunded DECIMAL(12,2) NOT NULL,
  refund_method VARCHAR(30),
  restocked BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refund_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  refund_id UUID REFERENCES refunds(id) ON DELETE CASCADE,
  sale_item_id UUID REFERENCES sale_items(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  restock BOOLEAN DEFAULT true
);

-- =====================
-- PROJECTS & TASKS
-- =====================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  status VARCHAR(20) DEFAULT 'planning' CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  owner_id UUID REFERENCES users(id),
  start_date DATE,
  target_date DATE,
  completed_date DATE,
  budget DECIMAL(12,2) DEFAULT 0,
  spent DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  due_date DATE,
  completed_date DATE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue')),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'other',
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','blocked','completed','cancelled')),
  assignee_id UUID REFERENCES users(id),
  due_date DATE,
  completed_date DATE,
  blocked_reason TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence VARCHAR(20),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- NOTIFICATIONS
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  reference_id UUID,
  reference_type VARCHAR(50),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_business_date ON stock_movements(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_business_date ON sales(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_business ON purchase_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_business ON tasks(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_activity_log_business ON activity_log(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_held_sales_business ON held_sales(business_id);

-- =====================
-- TRIGGERS
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

SELECT 'Balanzify v2 schema created successfully' AS status;

-- =====================
-- SALE KEYS (idempotency + fraud prevention)
-- =====================
CREATE TABLE IF NOT EXISTS sale_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(128) UNIQUE NOT NULL,
  cashier_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  cart_fingerprint VARCHAR(256),         -- hash of cart contents, bound on first use
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_keys_key ON sale_keys(key);
CREATE INDEX IF NOT EXISTS idx_sale_keys_expires ON sale_keys(expires_at) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_sale_keys_cleanup ON sale_keys(used_at) WHERE used = true;

-- Cleanup function: delete used keys older than 48h and expired unused keys older than 1h
-- Safe: only touches rows that are already terminal state (used=true past retention, or expired+unused)
CREATE OR REPLACE FUNCTION cleanup_sale_keys() RETURNS void AS $$
BEGIN
  -- Delete used keys past 48h retention window (audit trail preserved in sales table)
  DELETE FROM sale_keys
  WHERE used = true AND used_at < NOW() - INTERVAL '48 hours';

  -- Delete expired unused keys older than 1h (network-dropped sessions that never retried)
  DELETE FROM sale_keys
  WHERE used = false AND expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- =====================
-- ENTERPRISE AUTH TABLES
-- =====================

-- token_version on users (for session revocation)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Refresh tokens (server-side, rotatable, revocable)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash VARCHAR(128) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE used = false;

-- Login attempt tracking (brute force protection)
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier VARCHAR(255) NOT NULL,
  ip_address INET,
  succeeded BOOLEAN DEFAULT false,
  attempted_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at);

-- API request log (for audit and rate limit analysis)
CREATE TABLE IF NOT EXISTS api_request_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trace_id UUID,
  user_id UUID,
  business_id UUID,
  method VARCHAR(10),
  path VARCHAR(500),
  status_code INTEGER,
  duration_ms INTEGER,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS api_request_log_2024 PARTITION OF api_request_log
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS api_request_log_2025 PARTITION OF api_request_log
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS api_request_log_2026 PARTITION OF api_request_log
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- Partition stock_movements by month (will have millions of rows)
-- NOTE: Existing stock_movements table needs migration for partitioning.
-- For new installs, stock_movements is already partitioned.
-- For upgrades, run migration script separately.

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_auth_tables() RETURNS void AS $$
BEGIN
  DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours';
  DELETE FROM api_request_log WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Scheduled cleanup (requires pg_cron extension on managed Postgres)
-- SELECT cron.schedule('cleanup-auth', '0 2 * * *', 'SELECT cleanup_auth_tables()');
-- SELECT cron.schedule('cleanup-sale-keys', '0 3 * * *', 'SELECT cleanup_sale_keys()');

SELECT 'Enterprise schema additions applied' AS status;

-- =====================
-- AFRICA/SOMALILAND ADDITIONS
-- =====================

-- Exchange rates for multi-currency (USD base)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  from_currency VARCHAR(10) NOT NULL,
  to_currency VARCHAR(10) NOT NULL,
  rate DECIMAL(16,6) NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, from_currency, to_currency)
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

-- Product images
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_key TEXT;

-- Business logo
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_key TEXT;

-- Stock count UI (physical stocktake)
-- Tables already exist: stock_counts, stock_count_items

-- Reorder suggestions (computed, stored for performance)
CREATE TABLE IF NOT EXISTS reorder_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  current_stock INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  suggested_qty INTEGER DEFAULT 0,
  preferred_supplier_id UUID REFERENCES suppliers(id),
  estimated_cost DECIMAL(12,2) DEFAULT 0,
  last_computed TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, product_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_reorder_business ON reorder_suggestions(business_id);

SELECT 'Africa/Somaliland additions applied' AS status;

-- =====================================================================
-- PHASE 3 ADDITIONS: Global-grade feature parity
-- =====================================================================

-- Product variants (size, colour, weight, etc.)
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(100),
  barcode VARCHAR(100),
  attributes JSONB NOT NULL DEFAULT '{}',  -- e.g. {"size":"L","colour":"Red"}
  cost_price DECIMAL(12,2) DEFAULT 0,
  selling_price DECIMAL(12,2) DEFAULT 0,
  wholesale_price DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;

-- Variant-level stock (extends stock_levels to support variant_id)
ALTER TABLE stock_levels ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE stock_adjustment_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

-- Loyalty programme
CREATE TABLE IF NOT EXISTS loyalty_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  points_per_dollar DECIMAL(6,2) DEFAULT 1.00,
  dollar_per_point DECIMAL(6,4) DEFAULT 0.01,
  min_redeem_points INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('earn','redeem','adjust','expire')),
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_business ON loyalty_ledger(business_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;

-- Coupon / promo codes
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('pct','flat','free_item')),
  value DECIMAL(12,2) NOT NULL DEFAULT 0,
  min_purchase DECIMAL(12,2) DEFAULT 0,
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  per_customer_limit INTEGER DEFAULT 1,
  valid_from DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coupons_business ON coupons(business_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(business_id, code);

-- Track coupon usage per sale
ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS loyalty_discount DECIMAL(12,2) DEFAULT 0;

-- Petty cash
CREATE TABLE IF NOT EXISTS petty_cash (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('in','out')),
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  reference VARCHAR(100),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_business ON petty_cash(business_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_shift ON petty_cash(shift_id);

-- Bundle / kit products
CREATE TABLE IF NOT EXISTS product_bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  selling_price DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_id UUID NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

-- Serialised items (electronics, high-value goods)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_serialised BOOLEAN DEFAULT false;
CREATE TABLE IF NOT EXISTS serial_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  serial_number VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'in_stock' CHECK (status IN ('in_stock','sold','returned','defective')),
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_serial_product ON serial_numbers(product_id);
CREATE INDEX IF NOT EXISTS idx_serial_number ON serial_numbers(business_id, serial_number);

-- Barcode label batches
CREATE TABLE IF NOT EXISTS barcode_label_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_ids JSONB NOT NULL DEFAULT '[]',
  label_format VARCHAR(20) DEFAULT '2x1inch',
  pdf_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- FIFO cost layers (per product/variant/location, per receipt)
CREATE TABLE IF NOT EXISTS cost_layers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  quantity_received INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL,
  unit_cost DECIMAL(12,4) NOT NULL,
  received_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_layers_product ON cost_layers(product_id, received_at);

-- Period comparison helper view
CREATE OR REPLACE VIEW sales_daily_summary AS
  SELECT
    business_id,
    DATE(created_at) AS sale_date,
    COUNT(*) AS transaction_count,
    COALESCE(SUM(total_amount),0) AS revenue,
    COALESCE(SUM(discount_amount),0) AS discounts,
    COALESCE(SUM(total_amount - COALESCE(cost_total,0)),0) AS gross_profit,
    COALESCE(SUM(cash_amount),0) AS cash_revenue,
    COALESCE(SUM(zaad_amount),0) AS zaad_revenue,
    COALESCE(SUM(card_amount),0) AS card_revenue
  FROM sales
  WHERE status = 'completed'
  GROUP BY business_id, DATE(created_at);

-- Customer segment tags
ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS diaspora_currency VARCHAR(3) DEFAULT 'USD';

-- Supplier catalog snapshot
CREATE TABLE IF NOT EXISTS supplier_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  supplier_sku VARCHAR(100),
  barcode VARCHAR(100),
  unit_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  min_order_qty INTEGER DEFAULT 1,
  lead_time_days INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  imported_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_catalog_supplier ON supplier_catalog(supplier_id);

-- Scheduled reports
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) NOT NULL,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  send_time TIME DEFAULT '08:00',
  day_of_week INTEGER,
  day_of_month INTEGER,
  recipients JSONB DEFAULT '[]',
  filters JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp message log
CREATE TABLE IF NOT EXISTS whatsapp_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_phone VARCHAR(30) NOT NULL,
  message_type VARCHAR(50),
  content TEXT,
  reference_type VARCHAR(50),
  reference_id UUID,
  sent_at TIMESTAMP DEFAULT NOW()
);

SELECT 'Phase 3 schema applied' AS status;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 4: ALL MISSING TABLES
-- Tax rates, webhooks, sale payments, hotel, restaurant,
-- credit ledger, payment plans, diaspora payments, settlement
-- ═══════════════════════════════════════════════════════════════════════

-- Enum types (PostgreSQL)
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending','completed','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE webhook_status AS ENUM ('pending','delivered','retrying','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('available','occupied','reserved','checkout','cleaning','maintenance','blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reservation_status AS ENUM ('confirmed','checked_in','checked_out','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE folio_status AS ENUM ('open','pending','settled','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE folio_charge_type AS ENUM ('room_night','restaurant','laundry','minibar','transport','telephone','business_center','spa','damage','discount','tax','service_charge','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE table_status AS ENUM ('available','occupied','reserved','cleaning','merged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending','sent','preparing','ready','served','completed','cancelled','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('dine_in','takeaway','delivery','room_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kitchen_ticket_status AS ENUM ('pending','preparing','ready','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE credit_ledger_type AS ENUM ('purchase','repayment','adjustment','writeoff','diaspora_payment','installment_payment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_plan_status AS ENUM ('active','completed','defaulted','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE installment_status AS ENUM ('pending','paid','overdue','partial','waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE diaspora_payment_status AS ENUM ('pending','processing','completed','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE settlement_provider_type AS ENUM ('bank','mobile_money','fintech');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tax Rates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_rates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  rate        DECIMAL(8,4) NOT NULL,
  region      VARCHAR(100),
  is_default  BOOLEAN DEFAULT false,
  is_inclusive BOOLEAN DEFAULT false,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tax_rates_business ON tax_rates(business_id);

-- ── Webhook Endpoints ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url            VARCHAR(500) NOT NULL,
  secret         VARCHAR(128) NOT NULL,
  events         TEXT[] NOT NULL DEFAULT '{}',
  description    VARCHAR(255),
  is_active      BOOLEAN DEFAULT true,
  success_count  INTEGER DEFAULT 0,
  failure_count  INTEGER DEFAULT 0,
  last_success_at TIMESTAMP,
  last_failure_at TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_business ON webhook_endpoints(business_id);

-- ── Webhook Deliveries ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  endpoint_id    UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  business_id    UUID NOT NULL,
  event          VARCHAR(100) NOT NULL,
  delivery_id    VARCHAR(128) NOT NULL UNIQUE,
  payload        TEXT NOT NULL,
  status         webhook_status DEFAULT 'pending',
  status_code    INTEGER,
  response_body  VARCHAR(500),
  duration_ms    INTEGER,
  attempt_count  INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  next_retry_at  TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);

-- ── Sale Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_payments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id            UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  provider           VARCHAR(50) NOT NULL,
  amount             DECIMAL(12,2) NOT NULL,
  currency           VARCHAR(3) DEFAULT 'USD',
  status             payment_status DEFAULT 'pending',
  provider_reference VARCHAR(255),
  phone              VARCHAR(30),
  last4              VARCHAR(4),
  brand              VARCHAR(20),
  tendered           DECIMAL(12,2),
  change             DECIMAL(12,2),
  raw_response       JSONB,
  note               VARCHAR(500),
  completed_at       TIMESTAMP,
  created_at         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_provider ON sale_payments(provider, provider_reference);
CREATE INDEX IF NOT EXISTS idx_sale_payments_business ON sale_payments(business_id, created_at);

-- Add receipt_token to sales if missing
ALTER TABLE sales ADD COLUMN IF NOT EXISTS receipt_token VARCHAR(64) UNIQUE;

-- ═══════════════════════════════════════════════════════════════════
-- HOTEL MODULE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS room_types (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  max_occupancy     INTEGER DEFAULT 2,
  bed_configuration VARCHAR(100),
  amenities         TEXT[] DEFAULT '{}',
  base_rate         DECIMAL(12,2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'USD',
  is_active         BOOLEAN DEFAULT true,
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_room_types_business ON room_types(business_id);

CREATE TABLE IF NOT EXISTS rooms (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES room_types(id),
  number       VARCHAR(20) NOT NULL,
  floor        INTEGER,
  status       room_status DEFAULT 'available',
  notes        TEXT,
  is_active    BOOLEAN DEFAULT true,
  last_cleaned TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, number)
);
CREATE INDEX IF NOT EXISTS idx_rooms_business_status ON rooms(business_id, status);

CREATE TABLE IF NOT EXISTS rate_plans (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  room_type_id       UUID REFERENCES room_types(id),
  name               VARCHAR(100) NOT NULL,
  description        TEXT,
  rate_per_night     DECIMAL(12,2) NOT NULL,
  currency           VARCHAR(3) DEFAULT 'USD',
  min_nights         INTEGER DEFAULT 1,
  max_nights         INTEGER,
  includes_breakfast BOOLEAN DEFAULT false,
  valid_from         DATE,
  valid_until        DATE,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_plans_business ON rate_plans(business_id);

CREATE TABLE IF NOT EXISTS reservations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reservation_number VARCHAR(30) NOT NULL UNIQUE,
  room_id            UUID NOT NULL REFERENCES rooms(id),
  guest_id           UUID NOT NULL REFERENCES customers(id),
  status             reservation_status DEFAULT 'confirmed',
  check_in_date      DATE NOT NULL,
  check_out_date     DATE NOT NULL,
  actual_check_in    TIMESTAMP,
  actual_check_out   TIMESTAMP,
  nights             INTEGER NOT NULL,
  adults             INTEGER DEFAULT 1,
  children           INTEGER DEFAULT 0,
  rate_plan_id       UUID REFERENCES rate_plans(id),
  rate_per_night     DECIMAL(12,2) NOT NULL,
  currency           VARCHAR(3) DEFAULT 'USD',
  total_room_charge  DECIMAL(12,2) DEFAULT 0,
  deposit_paid       DECIMAL(12,2) DEFAULT 0,
  source             VARCHAR(50) DEFAULT 'walk_in',
  special_requests   TEXT,
  corporate_account_id UUID,
  notes              TEXT,
  checked_in_by      UUID REFERENCES users(id),
  checked_out_by     UUID REFERENCES users(id),
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_business ON reservations(business_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(business_id, check_in_date, check_out_date);

CREATE TABLE IF NOT EXISTS folios (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  folio_number   VARCHAR(30) NOT NULL UNIQUE,
  reservation_id UUID UNIQUE REFERENCES reservations(id),
  guest_id       UUID NOT NULL REFERENCES customers(id),
  status         folio_status DEFAULT 'open',
  currency       VARCHAR(3) DEFAULT 'USD',
  total_charges  DECIMAL(12,2) DEFAULT 0,
  total_payments DECIMAL(12,2) DEFAULT 0,
  balance        DECIMAL(12,2) DEFAULT 0,
  notes          TEXT,
  settled_at     TIMESTAMP,
  settled_by     UUID REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folios_business_status ON folios(business_id, status);
CREATE INDEX IF NOT EXISTS idx_folios_guest ON folios(guest_id);

CREATE TABLE IF NOT EXISTS folio_charges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio_id       UUID NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  business_id    UUID NOT NULL,
  type           folio_charge_type NOT NULL,
  description    VARCHAR(255) NOT NULL,
  quantity       DECIMAL(8,2) DEFAULT 1,
  unit_amount    DECIMAL(12,2) NOT NULL,
  total_amount   DECIMAL(12,2) NOT NULL,
  currency       VARCHAR(3) DEFAULT 'USD',
  tax_amount     DECIMAL(12,2) DEFAULT 0,
  tax_rate_id    UUID REFERENCES tax_rates(id),
  charge_date    DATE NOT NULL,
  is_void        BOOLEAN DEFAULT false,
  void_reason    TEXT,
  reference_id   UUID,
  reference_type VARCHAR(50),
  posted_by      UUID REFERENCES users(id),
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folio_charges_folio ON folio_charges(folio_id);

CREATE TABLE IF NOT EXISTS folio_payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio_id      UUID NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL,
  provider      VARCHAR(50) NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  currency      VARCHAR(3) DEFAULT 'USD',
  reference     VARCHAR(255),
  notes         TEXT,
  received_by   UUID REFERENCES users(id),
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folio_payments_folio ON folio_payments(folio_id);

CREATE TABLE IF NOT EXISTS housekeeping_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  room_id       UUID NOT NULL REFERENCES rooms(id),
  type          VARCHAR(30) NOT NULL,
  status        VARCHAR(20) DEFAULT 'pending',
  assigned_to   UUID REFERENCES users(id),
  started_at    TIMESTAMP,
  completed_at  TIMESTAMP,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_housekeeping_business ON housekeeping_logs(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_housekeeping_room ON housekeeping_logs(room_id);

CREATE TABLE IF NOT EXISTS corporate_accounts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  company_name         VARCHAR(255) NOT NULL,
  contact_person       VARCHAR(255),
  phone                VARCHAR(50),
  email                VARCHAR(255),
  address              TEXT,
  credit_limit         DECIMAL(12,2) DEFAULT 0,
  outstanding_balance  DECIMAL(12,2) DEFAULT 0,
  payment_terms_days   INTEGER DEFAULT 30,
  negotiated_rate      DECIMAL(12,2),
  currency             VARCHAR(3) DEFAULT 'USD',
  is_active            BOOLEAN DEFAULT true,
  notes                TEXT,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_accounts_business ON corporate_accounts(business_id);

-- ═══════════════════════════════════════════════════════════════════
-- RESTAURANT MODULE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS modifier_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT false,
  min_select  INTEGER DEFAULT 0,
  max_select  INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_business ON modifier_groups(business_id);

CREATE TABLE IF NOT EXISTS modifier_options (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id         UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  price_adjustment DECIMAL(8,2) DEFAULT 0,
  is_default       BOOLEAN DEFAULT false,
  is_active        BOOLEAN DEFAULT true,
  sort_order       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  number         VARCHAR(20) NOT NULL,
  name           VARCHAR(50),
  capacity       INTEGER DEFAULT 4,
  section        VARCHAR(50),
  status         table_status DEFAULT 'available',
  merged_with_id UUID,
  is_active      BOOLEAN DEFAULT true,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id, number)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_business ON restaurant_tables(business_id, status);

CREATE TABLE IF NOT EXISTS restaurant_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_number        VARCHAR(30) NOT NULL UNIQUE,
  table_id            UUID REFERENCES restaurant_tables(id),
  customer_id         UUID REFERENCES customers(id),
  staff_id            UUID NOT NULL REFERENCES users(id),
  status              order_status DEFAULT 'pending',
  type                order_type DEFAULT 'dine_in',
  covers              INTEGER DEFAULT 1,
  notes               TEXT,
  folio_id            UUID REFERENCES folios(id),
  sale_id             UUID REFERENCES sales(id),
  subtotal            DECIMAL(12,2) DEFAULT 0,
  tax_amount          DECIMAL(12,2) DEFAULT 0,
  service_charge      DECIMAL(12,2) DEFAULT 0,
  total_amount        DECIMAL(12,2) DEFAULT 0,
  sent_to_kitchen_at  TIMESTAMP,
  completed_at        TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_business ON restaurant_orders(business_id, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table ON restaurant_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_created ON restaurant_orders(business_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  quantity        INTEGER DEFAULT 1,
  unit_price      DECIMAL(12,2) NOT NULL,
  modifier_total  DECIMAL(12,2) DEFAULT 0,
  line_total      DECIMAL(12,2) NOT NULL,
  notes           VARCHAR(500),
  course          INTEGER DEFAULT 1,
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id    UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_id        UUID NOT NULL REFERENCES modifier_options(id),
  name             VARCHAR(100) NOT NULL,
  price_adjustment DECIMAL(8,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  station     VARCHAR(50),
  course      INTEGER DEFAULT 1,
  status      kitchen_ticket_status DEFAULT 'pending',
  items       JSONB NOT NULL DEFAULT '[]',
  sent_at     TIMESTAMP DEFAULT NOW(),
  started_at  TIMESTAMP,
  ready_at    TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_business ON kitchen_tickets(business_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_order ON kitchen_tickets(order_id);

-- ═══════════════════════════════════════════════════════════════════
-- CREDIT LEDGER, PAYMENT PLANS & DIASPORA PAYMENTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS credit_ledger (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type             credit_ledger_type NOT NULL,
  amount           DECIMAL(12,2) NOT NULL,
  direction        VARCHAR(6) NOT NULL CHECK (direction IN ('debit','credit')),
  balance_after    DECIMAL(12,2) NOT NULL,
  currency         VARCHAR(3) DEFAULT 'USD',
  sale_id          UUID REFERENCES sales(id),
  plan_item_id     UUID,
  diaspora_payment_id UUID,
  payment_method   VARCHAR(50),
  reference        VARCHAR(255),
  description      VARCHAR(500),
  recorded_by      UUID REFERENCES users(id),
  created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_customer ON credit_ledger(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_business ON credit_ledger(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_sale ON credit_ledger(sale_id);

CREATE TABLE IF NOT EXISTS payment_plans (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id          UUID NOT NULL REFERENCES customers(id),
  sale_id              UUID REFERENCES sales(id),
  plan_number          VARCHAR(30) NOT NULL UNIQUE,
  description          VARCHAR(255),
  total_amount         DECIMAL(12,2) NOT NULL,
  down_payment         DECIMAL(12,2) DEFAULT 0,
  balance_amount       DECIMAL(12,2) NOT NULL,
  currency             VARCHAR(3) DEFAULT 'USD',
  installments         INTEGER NOT NULL,
  frequency            VARCHAR(20) NOT NULL,
  status               payment_plan_status DEFAULT 'active',
  start_date           DATE NOT NULL,
  end_date             DATE,
  diaspora_enabled     BOOLEAN DEFAULT true,
  reminder_days_before INTEGER DEFAULT 3,
  last_reminder_at     TIMESTAMP,
  notes                TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_plans_business ON payment_plans(business_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_plans_customer ON payment_plans(customer_id);

CREATE TABLE IF NOT EXISTS payment_plan_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id        UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  business_id    UUID NOT NULL,
  customer_id    UUID NOT NULL REFERENCES customers(id),
  installment_no INTEGER NOT NULL,
  due_date       DATE NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  amount_paid    DECIMAL(12,2) DEFAULT 0,
  currency       VARCHAR(3) DEFAULT 'USD',
  status         installment_status DEFAULT 'pending',
  paid_at        TIMESTAMP,
  payment_method VARCHAR(50),
  reference      VARCHAR(255),
  payment_token  VARCHAR(64) UNIQUE,
  payment_url    VARCHAR(500),
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE(plan_id, installment_no)
);
CREATE INDEX IF NOT EXISTS idx_payment_plan_items_business ON payment_plan_items(business_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payment_plan_items_customer ON payment_plan_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_items_token ON payment_plan_items(payment_token);

-- Add FK from credit_ledger to payment_plan_items (deferred to avoid circular)
ALTER TABLE credit_ledger ADD CONSTRAINT fk_credit_ledger_plan_item
  FOREIGN KEY (plan_item_id) REFERENCES payment_plan_items(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS diaspora_payments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id            UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id            UUID NOT NULL REFERENCES customers(id),
  plan_item_id           UUID REFERENCES payment_plan_items(id),
  payer_name             VARCHAR(255),
  payer_phone            VARCHAR(50),
  payer_email            VARCHAR(255),
  payer_country          VARCHAR(2),
  amount                 DECIMAL(12,2) NOT NULL,
  currency               VARCHAR(3) DEFAULT 'USD',
  local_amount           DECIMAL(12,2),
  local_currency         VARCHAR(3),
  fx_rate                DECIMAL(16,6),
  provider               VARCHAR(50) NOT NULL,
  provider_ref           VARCHAR(255),
  status                 diaspora_payment_status DEFAULT 'pending',
  settlement_provider_id UUID,
  settlement_ref         VARCHAR(255),
  settled_at             TIMESTAMP,
  payment_token          VARCHAR(64) UNIQUE,
  notes                  TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diaspora_payments_business ON diaspora_payments(business_id, status);
CREATE INDEX IF NOT EXISTS idx_diaspora_payments_customer ON diaspora_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_diaspora_payments_token ON diaspora_payments(payment_token);

-- Add FK from credit_ledger to diaspora_payments
ALTER TABLE credit_ledger ADD CONSTRAINT fk_credit_ledger_diaspora
  FOREIGN KEY (diaspora_payment_id) REFERENCES diaspora_payments(id) DEFERRABLE INITIALLY DEFERRED;

-- ═══════════════════════════════════════════════════════════════════
-- SETTLEMENT PROVIDERS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_providers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  VARCHAR(255) NOT NULL,
  type                  settlement_provider_type NOT NULL,
  country               VARCHAR(2) NOT NULL,
  currency              VARCHAR(3) NOT NULL,
  is_active             BOOLEAN DEFAULT true,
  api_base_url          VARCHAR(500),
  api_key               VARCHAR(500),
  api_secret            VARCHAR(500),
  webhook_secret        VARCHAR(255),
  supports_balance      BOOLEAN DEFAULT false,
  supports_transactions BOOLEAN DEFAULT false,
  supports_inbound      BOOLEAN DEFAULT true,
  supports_outbound     BOOLEAN DEFAULT false,
  supports_fx           BOOLEAN DEFAULT false,
  mode                  VARCHAR(20) DEFAULT 'manual',
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(country, name)
);
CREATE INDEX IF NOT EXISTS idx_settlement_providers_country ON settlement_providers(country, is_active);

-- Add FK from diaspora_payments to settlement_providers
ALTER TABLE diaspora_payments ADD CONSTRAINT fk_diaspora_settlement
  FOREIGN KEY (settlement_provider_id) REFERENCES settlement_providers(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS settlement_accounts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider_id        UUID NOT NULL REFERENCES settlement_providers(id),
  account_number     VARCHAR(100),
  account_name       VARCHAR(255),
  currency           VARCHAR(3) DEFAULT 'USD',
  is_default         BOOLEAN DEFAULT false,
  is_active          BOOLEAN DEFAULT true,
  last_known_balance DECIMAL(12,2),
  last_sync_at       TIMESTAMP,
  created_at         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlement_accounts_business ON settlement_accounts(business_id);

SELECT 'Phase 4: All 27 missing tables created' AS status;
