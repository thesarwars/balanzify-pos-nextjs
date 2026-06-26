-- Multi-drug prescriptions: a header grouping several independent drug lines.

CREATE TABLE "prescription_groups" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "group_number" VARCHAR(40) NOT NULL,
    "patient_id" UUID,
    "patient_name" VARCHAR(255) NOT NULL,
    "patient_phone" VARCHAR(50),
    "prescriber_name" VARCHAR(255) NOT NULL,
    "prescriber_reg" VARCHAR(100),
    "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "prescription_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prescription_groups_business_id_idx" ON "prescription_groups"("business_id");

ALTER TABLE "prescription_groups"
    ADD CONSTRAINT "prescription_groups_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link each drug line back to its group.
ALTER TABLE "prescriptions" ADD COLUMN "group_id" UUID;
CREATE INDEX "prescriptions_group_id_idx" ON "prescriptions"("group_id");
ALTER TABLE "prescriptions"
    ADD CONSTRAINT "prescriptions_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "prescription_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
