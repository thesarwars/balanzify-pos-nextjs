-- Payment Accounts to reference parity: user-defined account types (one level
-- of nesting), a transaction history for deposits/transfers (balances stop
-- being unexplainable mutations), purchase payments become linkable to an
-- account, and accounts gain a note + creator.

CREATE TABLE "payment_account_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_account_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_account_types_business_id_name_key" ON "payment_account_types"("business_id", "name");
ALTER TABLE "payment_account_types" ADD CONSTRAINT "payment_account_types_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_account_types" ADD CONSTRAINT "payment_account_types_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "payment_account_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_accounts" ADD COLUMN "account_type_id" UUID;
ALTER TABLE "payment_accounts" ADD COLUMN "note" TEXT;
ALTER TABLE "payment_accounts" ADD COLUMN "created_by" UUID;
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_account_type_id_fkey"
  FOREIGN KEY ("account_type_id") REFERENCES "payment_account_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_account_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_account_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_account_transactions_account_id_idx" ON "payment_account_transactions"("account_id");
ALTER TABLE "payment_account_transactions" ADD CONSTRAINT "payment_account_transactions_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_account_transactions" ADD CONSTRAINT "payment_account_transactions_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "po_payments" ADD COLUMN "payment_account_id" UUID;
ALTER TABLE "po_payments" ADD CONSTRAINT "po_payments_payment_account_id_fkey"
  FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sale refunds are money OUT of an account — linkable like any payment.
ALTER TABLE "refunds" ADD COLUMN "payment_account_id" UUID;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_account_id_fkey"
  FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
