-- Product catalog profile (reference product form): barcode type, weight,
-- prep time, not-for-selling, manage-stock, tax type, brochure, per-location
-- availability, tile colour. Additive with safe defaults.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode_type" VARCHAR(10) NOT NULL DEFAULT 'C128',
ADD COLUMN     "brochure_key" TEXT,
ADD COLUMN     "brochure_url" TEXT,
ADD COLUMN     "enable_stock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "location_ids" UUID[],
ADD COLUMN     "not_for_selling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prep_time_minutes" INTEGER,
ADD COLUMN     "selling_price_tax_type" VARCHAR(10) NOT NULL DEFAULT 'exclusive',
ADD COLUMN     "tile_color" VARCHAR(10),
ADD COLUMN     "weight" DECIMAL(10,3);
