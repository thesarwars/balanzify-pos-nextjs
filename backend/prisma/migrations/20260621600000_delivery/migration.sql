-- Delivery / driver dispatch (opt-in marketplace layer).
CREATE TABLE "drivers" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id"  UUID NOT NULL,
  "name"         VARCHAR(255) NOT NULL,
  "phone"        VARCHAR(50),
  "vehicle_type" VARCHAR(40),
  "status"       VARCHAR(20) NOT NULL DEFAULT 'offline',
  "is_active"    BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drivers_business_id_status_idx" ON "drivers"("business_id", "status");
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "deliveries" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id"    UUID NOT NULL,
  "sale_id"        UUID,
  "driver_id"      UUID,
  "customer_name"  VARCHAR(255) NOT NULL,
  "customer_phone" VARCHAR(50),
  "address"        TEXT NOT NULL,
  "channel"        VARCHAR(20) NOT NULL DEFAULT 'pos',
  "items_summary"  TEXT,
  "order_amount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "delivery_fee"   DECIMAL(10,2) NOT NULL DEFAULT 0,
  "payment_mode"   VARCHAR(20) NOT NULL DEFAULT 'cod',
  "status"         VARCHAR(20) NOT NULL DEFAULT 'pending',
  "assigned_at"    TIMESTAMP(3),
  "delivered_at"   TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deliveries_business_id_status_idx" ON "deliveries"("business_id", "status");
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
