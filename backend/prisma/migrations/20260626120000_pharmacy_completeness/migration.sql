-- Pharmacy completeness: Rx clinical safety + Rx-only checkout enforcement.

-- Prescription: expiry, days-supply (early-refill gate), patient allergies.
ALTER TABLE "prescriptions" ADD COLUMN "days_supply" INTEGER;
ALTER TABLE "prescriptions" ADD COLUMN "valid_until" TIMESTAMP(3);
ALTER TABLE "prescriptions" ADD COLUMN "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Business: opt-in gate that blocks prescription-only drugs at POS without an Rx.
ALTER TABLE "businesses" ADD COLUMN "enforce_rx_on_sale" BOOLEAN NOT NULL DEFAULT false;
