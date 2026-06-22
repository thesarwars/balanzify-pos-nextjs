-- Wholesale partial fulfillment / backorders: how much of each line was fulfilled.
ALTER TABLE "wholesale_order_items" ADD COLUMN "fulfilled_qty" INTEGER NOT NULL DEFAULT 0;
