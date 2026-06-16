-- Discount rules (by brand / category / location, with priority + date range)
CREATE TABLE IF NOT EXISTS "discounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "type" VARCHAR(20) NOT NULL DEFAULT 'percentage',
  "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "category" VARCHAR(100),
  "brand_id" UUID,
  "location_id" UUID,
  "starts_at" DATE,
  "ends_at" DATE,
  "apply_price_groups" BOOLEAN NOT NULL DEFAULT true,
  "apply_customer_groups" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discounts_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "discounts_business_id_idx" ON "discounts"("business_id");

ALTER TABLE "discounts" ADD CONSTRAINT "discounts_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_brand_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL;
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL;
