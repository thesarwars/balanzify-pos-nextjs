-- Takaful (Islamic cooperative micro-insurance). Scaffolding (partner-gated).

CREATE TABLE "takaful_policies" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "policyholder" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50),
    "cover_type" VARCHAR(30) NOT NULL,
    "coverage_amount" DECIMAL(14,2) NOT NULL,
    "contribution" DECIMAL(14,2) NOT NULL,
    "contributed_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "term_months" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "takaful_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "takaful_policies_business_id_status_idx" ON "takaful_policies"("business_id", "status");

CREATE TABLE "takaful_claims" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "method" VARCHAR(30),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "takaful_claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "takaful_claims_policy_id_idx" ON "takaful_claims"("policy_id");
ALTER TABLE "takaful_claims" ADD CONSTRAINT "takaful_claims_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "takaful_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
