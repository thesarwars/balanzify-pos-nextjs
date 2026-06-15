-- AlterTable: add group + kitchen station
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "group_id" UUID;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "kitchen_station" VARCHAR(50);

-- CreateTable: reservation_groups
CREATE TABLE IF NOT EXISTS "reservation_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "group_number" VARCHAR(30) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "organiser_name" VARCHAR(255),
  "organiser_phone" VARCHAR(50),
  "organiser_email" VARCHAR(255),
  "corporate_account_id" UUID,
  "billing_type" VARCHAR(20) NOT NULL DEFAULT 'individual',
  "master_folio_id" UUID,
  "group_rate" DECIMAL(12,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "check_in_date" DATE NOT NULL,
  "check_out_date" DATE NOT NULL,
  "room_count" INTEGER NOT NULL DEFAULT 1,
  "pax" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservation_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_groups_group_number_key" ON "reservation_groups"("group_number");
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_groups_master_folio_id_key" ON "reservation_groups"("master_folio_id");
CREATE INDEX IF NOT EXISTS "reservation_groups_business_id_check_in_date_idx" ON "reservation_groups"("business_id","check_in_date");

-- CreateTable: lost_found
CREATE TABLE IF NOT EXISTS "lost_found" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "item_name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "found_date" DATE NOT NULL,
  "found_location" VARCHAR(255),
  "found_by" UUID,
  "guest_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'in_storage',
  "claimed_by" UUID,
  "claimed_at" TIMESTAMP(3),
  "storage_location" VARCHAR(100),
  "image_url" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lost_found_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "lost_found_business_id_status_idx" ON "lost_found"("business_id","status");

-- CreateTable: hotel_settings
CREATE TABLE IF NOT EXISTS "hotel_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "check_in_time" TEXT NOT NULL DEFAULT '14:00',
  "check_out_time" TEXT NOT NULL DEFAULT '11:00',
  "early_check_in_fee" DECIMAL(8,2),
  "late_check_out_fee" DECIMAL(8,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "tax_rate" DECIMAL(6,4),
  "service_charge_pct" DECIMAL(6,4),
  "deposit_pct" DECIMAL(6,4),
  "night_audit_time" TEXT NOT NULL DEFAULT '23:00',
  "auto_post_room_charges" BOOLEAN NOT NULL DEFAULT true,
  "require_deposit_on_book" BOOLEAN NOT NULL DEFAULT false,
  "allow_overbooking" BOOLEAN NOT NULL DEFAULT false,
  "wifi_password" VARCHAR(100),
  "check_in_welcome_msg" TEXT,
  "check_out_thank_you_msg" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hotel_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "hotel_settings_business_id_key" ON "hotel_settings"("business_id");

-- Foreign keys
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "reservation_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_groups" ADD CONSTRAINT "reservation_groups_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lost_found" ADD CONSTRAINT "lost_found_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lost_found" ADD CONSTRAINT "lost_found_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lost_found" ADD CONSTRAINT "lost_found_found_by_fkey" FOREIGN KEY ("found_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hotel_settings" ADD CONSTRAINT "hotel_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
