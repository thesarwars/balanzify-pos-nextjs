-- Merchant settlement / wallet account ledger. Scaffolding (EMI-licence-gated).
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" VARCHAR(30) NOT NULL DEFAULT 'cash',
    "note" VARCHAR(255),
    "balance_after" DECIMAL(14,2) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wallet_transactions_business_id_created_at_idx" ON "wallet_transactions"("business_id", "created_at");
