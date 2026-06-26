-- FEFO: carry the batch expiry on the cost layer so consumption can pick the
-- nearest-expiry stock first (perishables), while non-perishables stay FIFO.
ALTER TABLE "cost_layers" ADD COLUMN "expiry_date" TIMESTAMP(3);
CREATE INDEX "cost_layers_product_id_expiry_date_idx" ON "cost_layers"("product_id", "expiry_date");
