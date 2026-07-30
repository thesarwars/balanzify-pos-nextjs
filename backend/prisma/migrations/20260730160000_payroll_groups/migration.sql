-- Payroll batches, plus the identifying columns the reference's payroll list
-- shows: a human reference number, the location, and who ran it.
--
-- A payroll was previously created straight to status 'paid' with the GL
-- journal posted in the same transaction and no PUT or DELETE, so it was
-- irreversible the instant it existed. Groups add draft -> approved -> paid,
-- with the journal posting on the move to paid.

CREATE TABLE "payroll_groups" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "business_id"    UUID         NOT NULL,
  "name"           VARCHAR(255) NOT NULL,
  "month"          VARCHAR(7)   NOT NULL,
  "status"         VARCHAR(20)  NOT NULL DEFAULT 'draft',
  "payment_status" VARCHAR(20)  NOT NULL DEFAULT 'unpaid',
  "location_id"    UUID,
  "created_by_id"  UUID,
  "paid_at"        TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payroll_groups_business_id_month_idx" ON "payroll_groups" ("business_id", "month");
ALTER TABLE "payroll_groups" ADD CONSTRAINT "payroll_groups_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_groups" ADD CONSTRAINT "payroll_groups_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_groups" ADD CONSTRAINT "payroll_groups_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payrolls"
  ADD COLUMN "reference_no"  VARCHAR(50),
  ADD COLUMN "location_id"   UUID,
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "group_id"      UUID,
  ADD COLUMN "paid_at"       TIMESTAMP(3);

CREATE UNIQUE INDEX "payrolls_business_id_reference_no_key" ON "payrolls" ("business_id", "reference_no");
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "payroll_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing runs predate the lifecycle and were all posted immediately, so they
-- are paid; stamp paid_at from their creation and backfill the location from
-- the employee's. Reference numbers are assigned per business in creation
-- order, matching the YYYY/NNNN format the generator produces from here on.
UPDATE "payrolls" SET "paid_at" = "created_at" WHERE "status" = 'paid' AND "paid_at" IS NULL;
UPDATE "payrolls" p SET "location_id" = e."location_id"
  FROM "employees" e WHERE e."id" = p."employee_id" AND p."location_id" IS NULL;

UPDATE "payrolls" p SET "reference_no" = n."ref"
FROM (
  SELECT "id",
         substring("month" from 1 for 4) || '/' ||
         lpad(ROW_NUMBER() OVER (PARTITION BY "business_id", substring("month" from 1 for 4)
                                 ORDER BY "created_at")::text, 4, '0') AS "ref"
  FROM "payrolls"
) n
WHERE n."id" = p."id" AND p."reference_no" IS NULL;
