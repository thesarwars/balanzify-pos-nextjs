-- Expenses & expense categories
CREATE TABLE IF NOT EXISTS "expense_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_business_id_name_key" ON "expense_categories"("business_id","name");

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "category_id" UUID,
  "location_id" UUID,
  "expense_number" VARCHAR(50) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payment_status" VARCHAR(20) NOT NULL DEFAULT 'paid',
  "expense_for" VARCHAR(255),
  "note" TEXT,
  "is_refund" BOOLEAN NOT NULL DEFAULT false,
  "expense_date" TIMESTAMP(3) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "expenses_business_id_expense_date_idx" ON "expenses"("business_id","expense_date");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
