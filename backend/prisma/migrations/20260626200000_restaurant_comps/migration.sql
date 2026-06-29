-- Restaurant comps: a categorised "comp" reason on an order line (distinct from a void).
ALTER TABLE "order_items" ADD COLUMN "comp_reason" VARCHAR(40);
