-- Commission: per-user rate + per-business report settings
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "commission_percent" DECIMAL(6,2) NOT NULL DEFAULT 0;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "commission_calc" VARCHAR(30) NOT NULL DEFAULT 'invoice_value';
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "commission_agent_type" VARCHAR(30) NOT NULL DEFAULT 'logged_in_user';
