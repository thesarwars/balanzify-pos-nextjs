-- Fiscalization: per-business fiscal device + signed, tamper-evident receipts
-- for tax-authority compliance (Kenya eTIMS / Tanzania VFD / Rwanda EBM).
CREATE TABLE "fiscal_config" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id"        UUID NOT NULL,
  "jurisdiction"       VARCHAR(20) NOT NULL DEFAULT 'none',
  "device_serial"      VARCHAR(64),
  "device_key"         VARCHAR(128),
  "enabled"            BOOLEAN NOT NULL DEFAULT false,
  "last_fiscal_number" INTEGER NOT NULL DEFAULT 0,
  "last_signature"     VARCHAR(128),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fiscal_config_business_id_key" ON "fiscal_config"("business_id");
ALTER TABLE "fiscal_config" ADD CONSTRAINT "fiscal_config_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fiscal_receipts" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id"       UUID NOT NULL,
  "sale_id"           UUID NOT NULL,
  "jurisdiction"      VARCHAR(20) NOT NULL,
  "fiscal_number"     INTEGER NOT NULL,
  "invoice_label"     VARCHAR(48) NOT NULL,
  "signature"         VARCHAR(128) NOT NULL,
  "verification_code" VARCHAR(48) NOT NULL,
  "qr_data"           TEXT NOT NULL,
  "device_serial"     VARCHAR(64),
  "prev_signature"    VARCHAR(128),
  "status"            VARCHAR(20) NOT NULL DEFAULT 'signed',
  "transmitted_at"    TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fiscal_receipts_sale_id_key" ON "fiscal_receipts"("sale_id");
CREATE UNIQUE INDEX "fiscal_receipts_verification_code_key" ON "fiscal_receipts"("verification_code");
CREATE INDEX "fiscal_receipts_business_id_status_idx" ON "fiscal_receipts"("business_id", "status");
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
