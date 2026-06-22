-- General Ledger: double-entry accounting spine
CREATE TABLE "accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "normal_balance" VARCHAR(10) NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounts_business_id_code_key" ON "accounts"("business_id","code");
CREATE INDEX "accounts_business_id_idx" ON "accounts"("business_id");

CREATE TABLE "journal_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "entry_number" VARCHAR(40) NOT NULL,
  "date" DATE NOT NULL,
  "description" TEXT,
  "source_type" VARCHAR(40),
  "source_id" UUID,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "journal_entries_business_id_date_idx" ON "journal_entries"("business_id","date");
CREATE INDEX "journal_entries_source_type_source_id_idx" ON "journal_entries"("source_type","source_id");

CREATE TABLE "journal_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "journal_entry_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "journal_lines_journal_entry_id_idx" ON "journal_lines"("journal_entry_id");
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
