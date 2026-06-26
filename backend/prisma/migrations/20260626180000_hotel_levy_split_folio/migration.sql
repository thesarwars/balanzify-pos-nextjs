-- Tourism levy (separate from VAT) and split-folio support.
ALTER TABLE "hotel_settings" ADD COLUMN "tourism_levy_pct" DECIMAL(6,4);

ALTER TABLE "folios" ADD COLUMN "split_from_reservation_id" UUID;
CREATE INDEX "folios_split_from_reservation_id_idx" ON "folios"("split_from_reservation_id");
