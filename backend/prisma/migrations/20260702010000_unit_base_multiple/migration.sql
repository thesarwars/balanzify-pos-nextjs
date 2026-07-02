-- Units: "multiple of other unit" (e.g. 1 Dozen = 12 x Pieces). Additive.

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "base_multiplier" DECIMAL(12,4),
ADD COLUMN     "base_unit_id" UUID;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
