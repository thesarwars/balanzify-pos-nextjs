-- Expense capture: attach a snapped receipt photo URL.
ALTER TABLE "expenses" ADD COLUMN "receipt_url" TEXT;
