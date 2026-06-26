-- Wholesale B2B control layer: per-customer pricing tier, payment terms, due dates.
ALTER TABLE "customers" ADD COLUMN "price_group_id" UUID;
ALTER TABLE "customers" ADD COLUMN "wholesale_terms_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "customers"
    ADD CONSTRAINT "customers_price_group_id_fkey"
    FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wholesale_orders" ADD COLUMN "due_date" TIMESTAMP(3);
