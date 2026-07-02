-- Purchase-order items: optional purchase unit (e.g. buy in Dozens). Stock is
-- converted to base units at receipt. Additive.

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "unit_id" UUID;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
