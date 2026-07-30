-- Named, reusable shift templates replace EmployeeShift, which was 1:1 per
-- employee (@unique employee_id), had no name and so could not be shared,
-- carried no weekly off days and no auto-clock-out.

CREATE TABLE "shift_templates" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "business_id"     UUID         NOT NULL,
  "name"            VARCHAR(100) NOT NULL,
  "type"            VARCHAR(20)  NOT NULL DEFAULT 'fixed',
  "start_time"      VARCHAR(5),
  "end_time"        VARCHAR(5),
  "weekly_off_days" INTEGER[]    NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "auto_clock_out"  BOOLEAN      NOT NULL DEFAULT false,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shift_templates_business_id_name_key" ON "shift_templates" ("business_id", "name");
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "shift_assignments" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID         NOT NULL,
  "shift_id"    UUID         NOT NULL,
  "employee_id" UUID         NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shift_assignments_shift_id_employee_id_key" ON "shift_assignments" ("shift_id", "employee_id");
CREATE INDEX "shift_assignments_business_id_employee_id_idx" ON "shift_assignments" ("business_id", "employee_id");
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shift_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attendance remembers the shift it was judged against, plus the capture fields
-- the reference records on a clock-in.
ALTER TABLE "attendance"
  ADD COLUMN "shift_id"       UUID,
  ADD COLUMN "ip_address"     VARCHAR(64),
  ADD COLUMN "clock_in_note"  VARCHAR(500),
  ADD COLUMN "clock_out_note" VARCHAR(500);
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Carry the existing per-employee shifts over ──────────────────────────────
-- Every distinct (type, start, end) in a business becomes one shared template,
-- named for what it is, and each employee is assigned to the one they had.
INSERT INTO "shift_templates" ("id", "business_id", "name", "type", "start_time", "end_time")
SELECT
  gen_random_uuid(),
  d."business_id",
  CASE WHEN d."type" = 'flexible' THEN 'Flexible shift'
       ELSE 'Shift ' || COALESCE(d."start", '?') || '-' || COALESCE(d."end", '?') END,
  d."type",
  CASE WHEN d."type" = 'flexible' THEN NULL ELSE d."start" END,
  CASE WHEN d."type" = 'flexible' THEN NULL ELSE d."end" END
FROM (
  SELECT DISTINCT e."business_id", es."type", es."start", es."end"
  FROM "employee_shifts" es
  JOIN "employees" e ON e."id" = es."employee_id"
) d
ON CONFLICT ("business_id", "name") DO NOTHING;

INSERT INTO "shift_assignments" ("id", "business_id", "shift_id", "employee_id")
SELECT gen_random_uuid(), e."business_id", t."id", es."employee_id"
FROM "employee_shifts" es
JOIN "employees" e ON e."id" = es."employee_id"
JOIN "shift_templates" t
  ON t."business_id" = e."business_id"
 AND t."name" = CASE WHEN es."type" = 'flexible' THEN 'Flexible shift'
                     ELSE 'Shift ' || COALESCE(es."start", '?') || '-' || COALESCE(es."end", '?') END
ON CONFLICT ("shift_id", "employee_id") DO NOTHING;

DROP TABLE "employee_shifts";
