-- Service-type packing charge + service type reference recorded on the sale
ALTER TABLE "sales" ADD COLUMN "packing_charge" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "service_type_id" UUID;
