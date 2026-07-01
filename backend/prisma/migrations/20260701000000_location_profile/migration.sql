-- Location profile: contact/address, invoicing/pricing FKs, custom fields,
-- featured products, and per-location payment config. All additive/nullable.

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "alt_contact" VARCHAR(40),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "country" VARCHAR(120),
ADD COLUMN     "custom_field1" VARCHAR(255),
ADD COLUMN     "custom_field2" VARCHAR(255),
ADD COLUMN     "custom_field3" VARCHAR(255),
ADD COLUMN     "custom_field4" VARCHAR(255),
ADD COLUMN     "default_payment" VARCHAR(30),
ADD COLUMN     "email" VARCHAR(255),
ADD COLUMN     "featured_product_ids" UUID[],
ADD COLUMN     "invoice_layout_id" UUID,
ADD COLUMN     "invoice_scheme_id" UUID,
ADD COLUMN     "landmark" VARCHAR(255),
ADD COLUMN     "location_code" VARCHAR(50),
ADD COLUMN     "manager_id" UUID,
ADD COLUMN     "mobile" VARCHAR(40),
ADD COLUMN     "payment_accounts" JSONB,
ADD COLUMN     "payment_methods" TEXT[],
ADD COLUMN     "price_group_id" UUID,
ADD COLUMN     "state" VARCHAR(120),
ADD COLUMN     "website" VARCHAR(255),
ADD COLUMN     "zip_code" VARCHAR(30);

-- CreateIndex
CREATE INDEX "locations_business_id_idx" ON "locations"("business_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_invoice_scheme_id_fkey" FOREIGN KEY ("invoice_scheme_id") REFERENCES "invoice_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_invoice_layout_id_fkey" FOREIGN KEY ("invoice_layout_id") REFERENCES "invoice_layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_price_group_id_fkey" FOREIGN KEY ("price_group_id") REFERENCES "price_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
