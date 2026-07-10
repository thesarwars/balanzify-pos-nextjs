-- Add Sale (invoice) support.
--
-- draft / quotation / proforma are NON-POSTING statuses: the document exists but
-- no stock moves and no journal is written. Finalising one posts it.
--
-- sale_number becomes unique PER BUSINESS: two tenants both running the default
-- invoice scheme each mint "AS0001", and neither may block the other.

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('pending', 'packed', 'shipped', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "PayTermPeriod" AS ENUM ('days', 'months');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SaleStatus" ADD VALUE 'quotation';
ALTER TYPE "SaleStatus" ADD VALUE 'proforma';

-- DropIndex
DROP INDEX "sales_sale_number_key";

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "delivered_to" TEXT,
ADD COLUMN     "delivery_person_id" UUID,
ADD COLUMN     "document_key" TEXT,
ADD COLUMN     "document_url" TEXT,
ADD COLUMN     "expenses_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoice_scheme_id" UUID,
ADD COLUMN     "pay_term" INTEGER,
ADD COLUMN     "pay_term_period" "PayTermPeriod",
ADD COLUMN     "sale_date" TIMESTAMP(3),
ADD COLUMN     "shipping_address" TEXT,
ADD COLUMN     "shipping_charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_details" TEXT,
ADD COLUMN     "shipping_document_key" TEXT,
ADD COLUMN     "shipping_document_url" TEXT,
ADD COLUMN     "shipping_status" "ShippingStatus",
ADD COLUMN     "staff_note" TEXT,
ADD COLUMN     "tax_rate_id" UUID;

-- AlterTable
ALTER TABLE "sale_payments" ADD COLUMN     "paid_on" TIMESTAMP(3),
ADD COLUMN     "payment_account_id" UUID;

-- CreateTable
CREATE TABLE "sale_expenses" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_expenses_sale_id_idx" ON "sale_expenses"("sale_id");

-- CreateIndex
CREATE INDEX "sales_business_id_status_idx" ON "sales"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_sale_number_key" ON "sales"("business_id", "sale_number");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_invoice_scheme_id_fkey" FOREIGN KEY ("invoice_scheme_id") REFERENCES "invoice_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_delivery_person_id_fkey" FOREIGN KEY ("delivery_person_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_expenses" ADD CONSTRAINT "sale_expenses_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: a sale that predates this migration happened when it was written,
-- so its document date is its created_at. Idempotent (touches only NULLs).
UPDATE "sales" SET "sale_date" = "created_at" WHERE "sale_date" IS NULL;

-- Only NOW may the column take a default: adding it with one would have
-- stamped every historic sale with the migration timestamp instead of its own.
ALTER TABLE "sales" ALTER COLUMN "sale_date" SET DEFAULT CURRENT_TIMESTAMP;
