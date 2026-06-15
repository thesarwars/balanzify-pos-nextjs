-- Pharmacy fields + unit selling on products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "generic_name" VARCHAR(255);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "strength" VARCHAR(50);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "formulation" VARCHAR(50);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "manufacturer" VARCHAR(255);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_prescription_drug" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pack_size" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sell_by_unit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit_name" VARCHAR(30);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(12,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "kitchen_station" VARCHAR(50);
CREATE INDEX IF NOT EXISTS "products_generic_name_idx" ON "products"("generic_name");

-- Module licensing + market profile on businesses
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "enabled_modules" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "market" VARCHAR(30) NOT NULL DEFAULT 'somaliland';
