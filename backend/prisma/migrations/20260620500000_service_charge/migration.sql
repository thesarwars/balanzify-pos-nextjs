-- Service charge: a first-class charge on sales + a per-business rate config
ALTER TABLE "sales" ADD COLUMN "service_charge" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "businesses" ADD COLUMN "service_charge_pct" DECIMAL(6,4);
