-- Supplier invoice: the third leg of the 3-way match (PO ↔ GRN ↔ invoice).
CREATE TABLE "supplier_invoices" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "supplier_id" UUID,
    "invoice_number" VARCHAR(80) NOT NULL,
    "invoice_date" TIMESTAMP(3),
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "variances" JSONB,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_invoices_business_id_po_id_idx" ON "supplier_invoices"("business_id", "po_id");
ALTER TABLE "supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplier_invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "po_item_id" UUID,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "supplier_invoice_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_invoice_items_invoice_id_idx" ON "supplier_invoice_items"("invoice_id");
ALTER TABLE "supplier_invoice_items"
    ADD CONSTRAINT "supplier_invoice_items_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
