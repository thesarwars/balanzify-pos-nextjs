-- Tiered commission per user: "sell between FROM and TO, earn PERCENT".
-- Commission was previously a single flat percent on the user, which is the
-- degenerate one-band case and stays as the fallback.
CREATE TABLE "sales_target_bands" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  "business_id"       UUID           NOT NULL,
  "user_id"           UUID           NOT NULL,
  "from_amount"       DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "to_amount"         DECIMAL(14, 2),
  "commission_percent" DECIMAL(6, 2) NOT NULL DEFAULT 0,
  "created_at"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_target_bands_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sales_target_bands_business_id_user_id_idx" ON "sales_target_bands" ("business_id", "user_id");
ALTER TABLE "sales_target_bands" ADD CONSTRAINT "sales_target_bands_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_target_bands" ADD CONSTRAINT "sales_target_bands_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
