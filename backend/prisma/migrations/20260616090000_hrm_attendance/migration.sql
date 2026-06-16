-- HRM phase 2: attendance
CREATE TABLE IF NOT EXISTS "attendance" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "clock_in" VARCHAR(5),
  "clock_out" VARCHAR(5),
  "status" VARCHAR(20) NOT NULL DEFAULT 'present',
  "breaks" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_employee_id_date_key" ON "attendance"("employee_id","date");
CREATE INDEX IF NOT EXISTS "attendance_business_id_date_idx" ON "attendance"("business_id","date");

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
