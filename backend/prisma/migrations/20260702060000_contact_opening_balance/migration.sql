-- Contacts: opening balance (seeded into outstanding at creation). Additive.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

