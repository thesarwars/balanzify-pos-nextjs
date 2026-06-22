-- Restaurant: proper fields replacing string-hacks (waiter, 86, reservations)
ALTER TABLE "restaurant_tables" ADD COLUMN "waiter_id" UUID;
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "eighty_six" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "location_id" UUID,
  "date" DATE NOT NULL,
  "reason" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eighty_six_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "eighty_six_product_id_date_key" ON "eighty_six"("product_id","date");
CREATE INDEX "eighty_six_business_id_date_idx" ON "eighty_six"("business_id","date");
ALTER TABLE "eighty_six" ADD CONSTRAINT "eighty_six_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eighty_six" ADD CONSTRAINT "eighty_six_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "table_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "table_id" UUID,
  "guest_name" VARCHAR(255) NOT NULL,
  "guest_phone" VARCHAR(50),
  "reserved_at" TIMESTAMP(3) NOT NULL,
  "covers" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL DEFAULT 'booked',
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_reservations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "table_reservations_business_id_reserved_at_idx" ON "table_reservations"("business_id","reserved_at");
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
