-- HRM phase 1: employees, org units, settings, employee shifts
CREATE TABLE IF NOT EXISTS "employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255),
  "department" VARCHAR(100),
  "designation" VARCHAR(100),
  "location_id" UUID,
  "salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "joined_at" DATE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "user_id" UUID,
  "commission_percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "employees_business_id_idx" ON "employees"("business_id");

CREATE TABLE IF NOT EXISTS "org_units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_units_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "org_units_business_id_kind_name_key" ON "org_units"("business_id","kind","name");

CREATE TABLE IF NOT EXISTS "hrm_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "work_start" VARCHAR(5) NOT NULL DEFAULT '08:00',
  "grace_minutes" INTEGER NOT NULL DEFAULT 10,
  "standard_hours" DECIMAL(5,2) NOT NULL DEFAULT 8,
  "half_day_hours" DECIMAL(5,2) NOT NULL DEFAULT 4,
  "overtime_rate" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
  "working_days" INTEGER NOT NULL DEFAULT 26,
  "late_deduction" DECIMAL(10,2) NOT NULL DEFAULT 2,
  "absent_deduction" VARCHAR(20) NOT NULL DEFAULT 'day',
  "show_attendance" BOOLEAN NOT NULL DEFAULT true,
  "show_overtime" BOOLEAN NOT NULL DEFAULT true,
  "show_leave" BOOLEAN NOT NULL DEFAULT true,
  "show_advance" BOOLEAN NOT NULL DEFAULT true,
  "show_bonus" BOOLEAN NOT NULL DEFAULT true,
  "show_incentive" BOOLEAN NOT NULL DEFAULT true,
  "show_deduction_breakdown" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "hrm_settings_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "hrm_settings_business_id_key" ON "hrm_settings"("business_id");

CREATE TABLE IF NOT EXISTS "employee_shifts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "type" VARCHAR(20) NOT NULL DEFAULT 'fixed',
  "start" VARCHAR(5) NOT NULL DEFAULT '08:00',
  "end" VARCHAR(5) NOT NULL DEFAULT '16:00',
  CONSTRAINT "employee_shifts_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "employee_shifts_employee_id_key" ON "employee_shifts"("employee_id");

ALTER TABLE "employees" ADD CONSTRAINT "employees_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL;
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "hrm_settings" ADD CONSTRAINT "hrm_settings_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
