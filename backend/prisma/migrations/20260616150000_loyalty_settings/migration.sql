-- Loyalty: store the full reward-settings config alongside the typed rule columns
ALTER TABLE "loyalty_rules" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
