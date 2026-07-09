-- Add shipping details + document attachment to purchase orders,
-- and a payment date (paid_on) to PO payments.
-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "document_key" TEXT,
ADD COLUMN     "document_url" TEXT,
ADD COLUMN     "shipping_details" TEXT;

-- AlterTable
ALTER TABLE "po_payments" ADD COLUMN     "paid_at" TIMESTAMP(3);
