-- Pharmacy: controlled-substance schedule + prescriptions + dispensing records
ALTER TABLE "products" ADD COLUMN "controlled_schedule" VARCHAR(10);

CREATE TABLE "prescriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "rx_number" VARCHAR(40) NOT NULL,
  "product_id" UUID NOT NULL,
  "patient_id" UUID,
  "patient_name" VARCHAR(255) NOT NULL,
  "patient_phone" VARCHAR(50),
  "prescriber_name" VARCHAR(255) NOT NULL,
  "prescriber_reg" VARCHAR(100),
  "sig" TEXT,
  "quantity" INTEGER NOT NULL,
  "refills_authorized" INTEGER NOT NULL DEFAULT 0,
  "refills_used" INTEGER NOT NULL DEFAULT 0,
  "daw" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prescriptions_business_id_idx" ON "prescriptions"("business_id");

CREATE TABLE "dispense_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "sale_id" UUID,
  "dispensed_by" UUID,
  "verified_by" UUID,
  "dispensed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispense_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dispense_records_business_id_idx" ON "dispense_records"("business_id");
CREATE INDEX "dispense_records_prescription_id_idx" ON "dispense_records"("prescription_id");

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispense_records" ADD CONSTRAINT "dispense_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
