-- Hotel cancellation / no-show policy settings.
ALTER TABLE "hotel_settings" ADD COLUMN "cancellation_deadline_hours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "hotel_settings" ADD COLUMN "cancellation_fee_pct" DECIMAL(6,4);
ALTER TABLE "hotel_settings" ADD COLUMN "no_show_fee_pct" DECIMAL(6,4);
