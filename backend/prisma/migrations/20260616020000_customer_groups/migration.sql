-- Customer groups (pricing tiers) + customer linkage
CREATE TABLE IF NOT EXISTS "customer_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "discount_pct" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "customer_groups_business_id_name_key" ON "customer_groups"("business_id","name");

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_group_id" UUID;

ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_group_fkey" FOREIGN KEY ("customer_group_id") REFERENCES "customer_groups"("id") ON DELETE SET NULL;
