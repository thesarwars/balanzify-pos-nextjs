-- Expenses to reference parity: the full document (title, payee, sub-category,
-- tax, contact, attachment), PARTIAL payments with their own rows (so a
-- reversal can put every tender back where it came from), and recurring
-- templates that materialise due copies of themselves.

-- Categories gain a code and may nest one level (sub-categories).
ALTER TABLE "expense_categories" ADD COLUMN "code" VARCHAR(50);
ALTER TABLE "expense_categories" ADD COLUMN "parent_id" UUID;
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "title" VARCHAR(255);
ALTER TABLE "expenses" ADD COLUMN "payment_to" VARCHAR(255);
ALTER TABLE "expenses" ADD COLUMN "sub_category_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "expense_for_user_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "contact_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "tax_rate_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "document_url" TEXT;
ALTER TABLE "expenses" ADD COLUMN "document_key" VARCHAR(255);
ALTER TABLE "expenses" ADD COLUMN "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "amount_due" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN "is_recurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "expenses" ADD COLUMN "recur_interval" INTEGER;
ALTER TABLE "expenses" ADD COLUMN "recur_interval_type" VARCHAR(10);
ALTER TABLE "expenses" ADD COLUMN "recur_repetitions" INTEGER;
ALTER TABLE "expenses" ADD COLUMN "recur_parent_id" UUID;
ALTER TABLE "expenses" ADD COLUMN "next_recur_date" TIMESTAMP(3);

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sub_category_id_fkey"
  FOREIGN KEY ("sub_category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expense_for_user_id_fkey"
  FOREIGN KEY ("expense_for_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tax_rate_id_fkey"
  FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recur_parent_id_fkey"
  FOREIGN KEY ("recur_parent_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One row per tender taken against an expense; reversal reads these.
CREATE TABLE "expense_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" VARCHAR(30) NOT NULL DEFAULT 'cash',
    "payment_account_id" UUID,
    "paid_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "expense_payments_expense_id_idx" ON "expense_payments"("expense_id");
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_fkey"
  FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_payment_account_id_fkey"
  FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: an existing 'paid' expense was settled in full (the old model had
-- no partial state); 'due' ones owe everything. Give paid rows a synthetic
-- cash payment row so future reversals know where the money went.
UPDATE "expenses" SET "amount_paid" = CASE WHEN "payment_status" = 'paid' THEN "amount" ELSE 0 END,
                      "amount_due"  = CASE WHEN "payment_status" = 'paid' THEN 0 ELSE "amount" END;
INSERT INTO "expense_payments" ("business_id", "expense_id", "amount", "method", "paid_on", "created_by")
SELECT "business_id", "id", "amount", 'cash', "expense_date", "created_by"
FROM "expenses" WHERE "payment_status" = 'paid' AND "amount" > 0;

-- Reference numbers are unique per business. Dedupe any historic collisions
-- (the old auto-generator was millisecond-based) before adding the constraint.
UPDATE "expenses" e
SET "expense_number" = e."expense_number" || '-' || substr(e."id"::text, 1, 4)
WHERE EXISTS (
  SELECT 1 FROM "expenses" d
  WHERE d."business_id" = e."business_id" AND d."expense_number" = e."expense_number" AND d."id" < e."id"
);
CREATE UNIQUE INDEX "expenses_business_id_expense_number_key" ON "expenses"("business_id", "expense_number");
