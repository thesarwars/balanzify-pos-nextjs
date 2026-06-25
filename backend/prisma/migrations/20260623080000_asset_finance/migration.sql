-- Asset / vehicle finance (Murabaha / Ijara). Scaffolding (licence-gated).

CREATE TABLE "asset_finance" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "borrower_name" VARCHAR(200) NOT NULL,
    "borrower_phone" VARCHAR(50),
    "structure" VARCHAR(20) NOT NULL DEFAULT 'murabaha',
    "asset_type" VARCHAR(50) NOT NULL,
    "asset_description" VARCHAR(255),
    "asset_cost" DECIMAL(14,2) NOT NULL,
    "markup" DECIMAL(14,2) NOT NULL,
    "total_payable" DECIMAL(14,2) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "amount_repaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'offered',
    "disbursed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "defaulted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_finance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_finance_business_id_status_idx" ON "asset_finance"("business_id", "status");

CREATE TABLE "asset_finance_repayments" (
    "id" UUID NOT NULL,
    "finance_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" VARCHAR(30) NOT NULL DEFAULT 'cash',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_finance_repayments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_finance_repayments_finance_id_idx" ON "asset_finance_repayments"("finance_id");
ALTER TABLE "asset_finance_repayments" ADD CONSTRAINT "asset_finance_repayments_finance_id_fkey"
    FOREIGN KEY ("finance_id") REFERENCES "asset_finance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
