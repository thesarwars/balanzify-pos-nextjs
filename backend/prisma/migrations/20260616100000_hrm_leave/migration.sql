-- HRM phase 3: leave types, leave requests, per-employee overrides
CREATE TABLE IF NOT EXISTS "leave_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "default_days" INTEGER NOT NULL DEFAULT 0,
  "accrues" BOOLEAN NOT NULL DEFAULT false,
  "paid" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_business_id_name_key" ON "leave_types"("business_id","name");

CREATE TABLE IF NOT EXISTS "leaves" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "from_date" DATE NOT NULL,
  "to_date" DATE NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "approved_by" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leaves_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "leaves_business_id_idx" ON "leaves"("business_id");

CREATE TABLE IF NOT EXISTS "employee_leave_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "employee_leave_overrides_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "employee_leave_overrides_employee_id_type_key" ON "employee_leave_overrides"("employee_id","type");

ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
ALTER TABLE "employee_leave_overrides" ADD CONSTRAINT "elo_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "employee_leave_overrides" ADD CONSTRAINT "elo_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
