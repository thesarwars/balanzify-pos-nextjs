-- One payroll per employee per month. Paying the same month twice also posted
-- the GL journal twice, so this is a money-correctness constraint, not hygiene.
CREATE UNIQUE INDEX "payrolls_business_id_employee_id_month_key"
  ON "payrolls" ("business_id", "employee_id", "month");
