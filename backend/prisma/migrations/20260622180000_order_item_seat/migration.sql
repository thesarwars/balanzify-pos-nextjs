-- Restaurant: seat/cover number on order items, for per-seat ordering & split-by-seat.
ALTER TABLE "order_items" ADD COLUMN "seat" INTEGER;
