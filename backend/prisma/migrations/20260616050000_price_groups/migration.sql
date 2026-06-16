-- Selling price groups (pricing tiers)
CREATE TABLE IF NOT EXISTS "price_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_groups_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "price_groups_business_id_name_key" ON "price_groups"("business_id","name");

ALTER TABLE "price_groups" ADD CONSTRAINT "price_groups_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
