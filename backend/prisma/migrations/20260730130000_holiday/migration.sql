-- Company holidays. A holiday is a date RANGE, optionally scoped to one
-- location (null = every location).
CREATE TABLE "holidays" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID         NOT NULL,
  "name"        VARCHAR(255) NOT NULL,
  "start_date"  DATE         NOT NULL,
  "end_date"    DATE         NOT NULL,
  "location_id" UUID,
  "note"        VARCHAR(1000),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "holidays_business_id_start_date_end_date_idx"
  ON "holidays" ("business_id", "start_date", "end_date");

ALTER TABLE "holidays" ADD CONSTRAINT "holidays_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
