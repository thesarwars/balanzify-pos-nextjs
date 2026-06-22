-- Delivery: zone-based fees + proof-of-delivery fields.
ALTER TABLE "deliveries" ADD COLUMN "zone_id" UUID;
ALTER TABLE "deliveries" ADD COLUMN "recipient_name" VARCHAR(255);
ALTER TABLE "deliveries" ADD COLUMN "pod_note" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "pod_photo_url" TEXT;

CREATE TABLE "delivery_zones" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name"        VARCHAR(120) NOT NULL,
  "fee"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "delivery_zones_business_id_idx" ON "delivery_zones"("business_id");
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
