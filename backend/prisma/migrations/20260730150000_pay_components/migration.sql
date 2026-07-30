-- Named, reusable earnings and deductions. Payroll was six anonymous Decimal
-- buckets retyped by hand each month, and the payslip could only print the five
-- component words compiled into the template.

CREATE TABLE "pay_components" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "business_id"     UUID           NOT NULL,
  "description"     VARCHAR(255)   NOT NULL,
  "type"            VARCHAR(20)    NOT NULL,
  "amount_type"     VARCHAR(20)    NOT NULL DEFAULT 'fixed',
  "amount"          DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "applicable_date" DATE,
  "employee_id"     UUID,
  "created_at"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pay_components_business_id_idx" ON "pay_components" ("business_id");
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What a run actually applied, so a payslip can itemise by name.
CREATE TABLE "payroll_lines" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "payroll_id"  UUID           NOT NULL,
  "description" VARCHAR(255)   NOT NULL,
  "type"        VARCHAR(20)    NOT NULL,
  "amount"      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payroll_lines_payroll_id_idx" ON "payroll_lines" ("payroll_id");
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payroll_id_fkey"
  FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
