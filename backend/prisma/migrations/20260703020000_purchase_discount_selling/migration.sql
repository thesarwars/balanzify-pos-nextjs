-- Add Purchase: order discount + per-line discount% and selling price. Additive.

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "discount_percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "selling_price" DECIMAL(12,2);

