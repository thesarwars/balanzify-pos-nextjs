-- Payroll statutory deductions breakdown (Kenya PAYE/NSSF/SHIF/Housing), for filing.
ALTER TABLE "payrolls" ADD COLUMN "statutory_country" VARCHAR(8);
ALTER TABLE "payrolls" ADD COLUMN "paye" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN "nssf" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN "shif" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN "housing_levy" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN "statutory_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
