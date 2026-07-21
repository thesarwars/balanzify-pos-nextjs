-- Stock Transfers to reference parity: an editable document date, shipping
-- charges, a denormalised money total, and a per-line unit price.
ALTER TABLE "stock_transfers" ADD COLUMN "transfer_date" TIMESTAMP(3);
ALTER TABLE "stock_transfers" ADD COLUMN "shipping_charges" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "stock_transfers" ADD COLUMN "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "stock_transfer_items" ADD COLUMN "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Existing transfers: the document date is when they were written.
UPDATE "stock_transfers" SET "transfer_date" = "created_at" WHERE "transfer_date" IS NULL;
ALTER TABLE "stock_transfers" ALTER COLUMN "transfer_date" SET DEFAULT CURRENT_TIMESTAMP;

-- Backfill line prices from the product's current cost (the value the old list
-- displayed), then roll totals up so old rows don't all read 0.00.
UPDATE "stock_transfer_items" sti
SET "unit_price" = p."cost_price"
FROM "products" p
WHERE p."id" = sti."product_id" AND sti."unit_price" = 0;

UPDATE "stock_transfers" st
SET "total_amount" = COALESCE(sub.total, 0)
FROM (
  SELECT "transfer_id", SUM("requested_qty" * "unit_price") AS total
  FROM "stock_transfer_items" GROUP BY "transfer_id"
) sub
WHERE sub."transfer_id" = st."id";

-- Reference numbers are unique PER BUSINESS, not globally — two tenants may
-- both hand-number a transfer "TR-0001" without blocking each other.
DROP INDEX "stock_transfers_transfer_number_key";
CREATE UNIQUE INDEX "stock_transfers_business_id_transfer_number_key" ON "stock_transfers"("business_id", "transfer_number");
