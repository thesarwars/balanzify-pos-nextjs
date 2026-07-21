-- Stock Adjustment documents (reference parity). The old stock_adjustments
-- table (single product + approval flow) stays for its API compatibility but
-- the UI now writes document-style adjustments: one header (location, type
-- Normal/Abnormal, reference, recovered amount, reason) with priced lines.
CREATE TYPE "AdjustmentDocType" AS ENUM ('normal', 'abnormal');

CREATE TABLE "stock_adjustment_docs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "reference_no" VARCHAR(50),
    "location_id" UUID NOT NULL,
    "type" "AdjustmentDocType" NOT NULL DEFAULT 'normal',
    "adjustment_date" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_recovered" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_adjustment_docs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_adjustment_doc_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "stock_adjustment_doc_items_pkey" PRIMARY KEY ("id")
);

-- Reference numbers are unique per business, mirroring transfers/sales.
CREATE UNIQUE INDEX "stock_adjustment_docs_business_id_reference_no_key" ON "stock_adjustment_docs"("business_id", "reference_no");
CREATE INDEX "stock_adjustment_docs_business_id_idx" ON "stock_adjustment_docs"("business_id");

ALTER TABLE "stock_adjustment_docs" ADD CONSTRAINT "stock_adjustment_docs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_docs" ADD CONSTRAINT "stock_adjustment_docs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_docs" ADD CONSTRAINT "stock_adjustment_docs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_doc_items" ADD CONSTRAINT "stock_adjustment_doc_items_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "stock_adjustment_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_doc_items" ADD CONSTRAINT "stock_adjustment_doc_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
