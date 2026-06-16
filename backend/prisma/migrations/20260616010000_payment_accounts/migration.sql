-- Payment accounts (cash / bank / mobile money)
CREATE TABLE IF NOT EXISTS "payment_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "type" VARCHAR(30) NOT NULL DEFAULT 'Cash',
  "account_number" VARCHAR(100),
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "payment_accounts_business_id_idx" ON "payment_accounts"("business_id");

ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
