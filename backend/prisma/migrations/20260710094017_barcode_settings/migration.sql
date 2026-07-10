-- Barcode sticker sheet layouts (physical geometry for the label printer). Additive.

-- CreateTable
CREATE TABLE "barcode_settings" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_continuous" BOOLEAN NOT NULL DEFAULT false,
    "top_margin" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "left_margin" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "sticker_width" DECIMAL(6,3) NOT NULL,
    "sticker_height" DECIMAL(6,3) NOT NULL,
    "paper_width" DECIMAL(6,3),
    "paper_height" DECIMAL(6,3),
    "stickers_in_one_row" INTEGER NOT NULL,
    "row_distance" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "col_distance" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "stickers_per_sheet" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "barcode_settings_business_id_idx" ON "barcode_settings"("business_id");

-- AddForeignKey
ALTER TABLE "barcode_settings" ADD CONSTRAINT "barcode_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode_settings" ADD CONSTRAINT "barcode_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

