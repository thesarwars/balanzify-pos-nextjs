-- Invoice layout: extended settings (labels, sub-headings, show-toggles, QR
-- fields, credit-note labels) stored as a single JSON config. Additive/nullable.

-- AlterTable
ALTER TABLE "invoice_layouts" ADD COLUMN     "config" JSONB;
