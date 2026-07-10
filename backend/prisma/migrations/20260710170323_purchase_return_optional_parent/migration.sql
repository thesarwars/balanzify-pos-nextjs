-- A standalone purchase return may span several purchases, so the header parent
-- becomes optional. Cost basis stays pinned per line via purchase_order_item_id.

-- DropForeignKey
ALTER TABLE "purchase_returns" DROP CONSTRAINT "purchase_returns_po_id_fkey";

-- AlterTable
ALTER TABLE "purchase_returns" ALTER COLUMN "po_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

