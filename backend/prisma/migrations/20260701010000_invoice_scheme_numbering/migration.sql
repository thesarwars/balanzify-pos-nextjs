-- Invoice scheme: numbering type (sequential | aleatory) + optional year prefix.
-- Additive, with safe defaults for existing rows.

-- AlterTable
ALTER TABLE "invoice_schemes" ADD COLUMN     "include_year" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numbering_type" VARCHAR(20) NOT NULL DEFAULT 'sequential';
