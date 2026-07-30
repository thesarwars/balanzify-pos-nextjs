-- The settings the reference's HRM Settings tab exposes, plus the human
-- reference numbers those prefixes feed. No HRM record previously had an
-- identifier a person could quote — leave, payroll and todos were raw UUIDs.

ALTER TABLE "hrm_settings"
  ADD COLUMN "leave_ref_prefix"       VARCHAR(20),
  ADD COLUMN "leave_instructions"     TEXT,
  ADD COLUMN "payroll_ref_prefix"     VARCHAR(20),
  ADD COLUMN "payroll_word_format"    VARCHAR(20) NOT NULL DEFAULT 'international',
  ADD COLUMN "location_required"      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "grace_before_checkin"   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN "grace_before_checkout"  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN "grace_after_checkout"   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN "commission_excludes_tax" BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN "todos_id_prefix"        VARCHAR(20);

ALTER TABLE "leaves"   ADD COLUMN "reference_no" VARCHAR(50);
ALTER TABLE "hr_todos" ADD COLUMN "reference_no" VARCHAR(50);

-- Number the existing rows per business in creation order, matching the format
-- the generator produces from here on (prefix + zero-padded sequence).
UPDATE "leaves" l SET "reference_no" = n."ref"
FROM (
  SELECT "id", lpad(ROW_NUMBER() OVER (PARTITION BY "business_id" ORDER BY "created_at")::text, 4, '0') AS "ref"
  FROM "leaves"
) n WHERE n."id" = l."id" AND l."reference_no" IS NULL;

UPDATE "hr_todos" t SET "reference_no" = n."ref"
FROM (
  SELECT "id", lpad(ROW_NUMBER() OVER (PARTITION BY "business_id" ORDER BY "created_at")::text, 4, '0') AS "ref"
  FROM "hr_todos"
) n WHERE n."id" = t."id" AND t."reference_no" IS NULL;

CREATE UNIQUE INDEX "leaves_business_id_reference_no_key"   ON "leaves"   ("business_id", "reference_no");
CREATE UNIQUE INDEX "hr_todos_business_id_reference_no_key" ON "hr_todos" ("business_id", "reference_no");
