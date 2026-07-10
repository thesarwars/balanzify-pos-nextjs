-- Attach a document (debit note scan) to a purchase return. Additive.

-- AlterTable
ALTER TABLE "purchase_returns" ADD COLUMN     "document_key" TEXT,
ADD COLUMN     "document_url" TEXT;

