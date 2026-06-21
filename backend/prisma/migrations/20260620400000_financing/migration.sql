-- Embedded financing: Sharia-compliant fixed-fee working-capital advances
CREATE TABLE "financing_advances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "reference" VARCHAR(40) NOT NULL,
  "principal" DECIMAL(14,2) NOT NULL,
  "fee_amount" DECIMAL(14,2) NOT NULL,
  "total_repayable" DECIMAL(14,2) NOT NULL,
  "amount_repaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'offered',
  "term_days" INTEGER NOT NULL,
  "collection_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
  "score" INTEGER,
  "disbursed_at" TIMESTAMP(3),
  "settled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "financing_advances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "financing_advances_business_id_status_idx" ON "financing_advances"("business_id","status");

CREATE TABLE "financing_repayments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "advance_id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financing_repayments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "financing_repayments_advance_id_idx" ON "financing_repayments"("advance_id");

ALTER TABLE "financing_advances" ADD CONSTRAINT "financing_advances_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financing_repayments" ADD CONSTRAINT "financing_repayments_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "financing_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
