-- HRM phase 5: payroll
CREATE TABLE IF NOT EXISTS "payrolls" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "basic" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "incentive" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "advance_recovered" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'paid',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "payrolls_business_id_idx" ON "payrolls"("business_id");

ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
