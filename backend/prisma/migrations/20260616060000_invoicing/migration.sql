-- Invoice layouts (receipt formats) + invoice schemes (numbering)
CREATE TABLE IF NOT EXISTS "invoice_layouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "design" VARCHAR(20) NOT NULL DEFAULT 'classic',
  "header_text" TEXT,
  "footer_text" TEXT,
  "show_address" BOOLEAN NOT NULL DEFAULT true,
  "show_tax_summary" BOOLEAN NOT NULL DEFAULT true,
  "show_total_in_words" BOOLEAN NOT NULL DEFAULT false,
  "show_discount" BOOLEAN NOT NULL DEFAULT true,
  "show_qr" BOOLEAN NOT NULL DEFAULT false,
  "show_letterhead" BOOLEAN NOT NULL DEFAULT false,
  "hide_prices" BOOLEAN NOT NULL DEFAULT false,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_layouts_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "invoice_layouts_business_id_idx" ON "invoice_layouts"("business_id");

CREATE TABLE IF NOT EXISTS "invoice_schemes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "prefix" VARCHAR(20),
  "start_number" INTEGER NOT NULL DEFAULT 1,
  "total_digits" INTEGER NOT NULL DEFAULT 4,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_schemes_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "invoice_schemes_business_id_idx" ON "invoice_schemes"("business_id");

ALTER TABLE "invoice_layouts" ADD CONSTRAINT "invoice_layouts_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "invoice_schemes" ADD CONSTRAINT "invoice_schemes_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
