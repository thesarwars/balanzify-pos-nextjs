-- Restaurant service types (dine-in / takeaway / delivery + packing charge)
CREATE TABLE IF NOT EXISTS "service_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "packing_charge" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "packing_charge_type" VARCHAR(20) NOT NULL DEFAULT 'fixed',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_types_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "service_types_business_id_idx" ON "service_types"("business_id");

ALTER TABLE "service_types" ADD CONSTRAINT "service_types_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
