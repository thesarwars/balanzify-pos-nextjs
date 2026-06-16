-- Product reference data: units, brands, variation templates + product brand link
CREATE TABLE IF NOT EXISTS "units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "actual_name" VARCHAR(100) NOT NULL,
  "short_name" VARCHAR(20) NOT NULL,
  "allow_decimal" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "units_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "units_business_id_idx" ON "units"("business_id");

CREATE TABLE IF NOT EXISTS "brands" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "brands_business_id_name_key" ON "brands"("business_id","name");

CREATE TABLE IF NOT EXISTS "variation_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "values" TEXT[] NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "variation_templates_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "variation_templates_business_id_idx" ON "variation_templates"("business_id");

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_id" UUID;

ALTER TABLE "units" ADD CONSTRAINT "units_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "brands" ADD CONSTRAINT "brands_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "variation_templates" ADD CONSTRAINT "variation_templates_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL;
