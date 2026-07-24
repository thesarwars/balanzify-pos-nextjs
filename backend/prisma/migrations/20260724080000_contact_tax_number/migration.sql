-- Tax registration number for contacts, shown on the Tax Report and on
-- invoices/purchase documents. Additive and nullable.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "tax_number" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_number" VARCHAR(100);
