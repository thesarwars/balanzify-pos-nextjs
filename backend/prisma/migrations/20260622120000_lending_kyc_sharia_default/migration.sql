-- Lending: KYC capture, blacklist, and Sharia-compliant late/default handling.

-- FinancingAdvance: reschedule + charity-late-fee tracking (debt never grows).
ALTER TABLE "financing_advances" ADD COLUMN "restructure_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "financing_advances" ADD COLUMN "charity_committed" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "financing_advances" ADD COLUMN "overdue_at" TIMESTAMP(3);
ALTER TABLE "financing_advances" ADD COLUMN "defaulted_at" TIMESTAMP(3);

CREATE TABLE "financing_kyc" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "id_type" VARCHAR(30) NOT NULL,
    "id_number" VARCHAR(60) NOT NULL,
    "date_of_birth" DATE,
    "phone" VARCHAR(40),
    "address" VARCHAR(300),
    "business_reg_no" VARCHAR(80),
    "document_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "rejection_reason" VARCHAR(300),
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financing_kyc_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "financing_kyc_business_id_key" ON "financing_kyc"("business_id");
ALTER TABLE "financing_kyc" ADD CONSTRAINT "financing_kyc_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "financing_blacklist" (
    "id" UUID NOT NULL,
    "id_number" VARCHAR(60) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financing_blacklist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "financing_blacklist_id_number_idx" ON "financing_blacklist"("id_number");
