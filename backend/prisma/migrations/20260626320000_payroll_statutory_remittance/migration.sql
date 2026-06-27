-- Payroll: track when a run's statutory withholding is remitted to the authority.
ALTER TABLE "payrolls" ADD COLUMN "statutory_remitted_at" TIMESTAMP(3);
