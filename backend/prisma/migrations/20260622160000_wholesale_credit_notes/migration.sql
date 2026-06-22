-- Wholesale credit notes / returns against a delivered order.

CREATE TABLE "wholesale_credit_notes" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "note_number" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(300),
    "total_credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wholesale_credit_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wholesale_credit_notes_order_id_idx" ON "wholesale_credit_notes"("order_id");
ALTER TABLE "wholesale_credit_notes" ADD CONSTRAINT "wholesale_credit_notes_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "wholesale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wholesale_credit_note_items" (
    "id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_credit" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "wholesale_credit_note_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wholesale_credit_note_items_credit_note_id_idx" ON "wholesale_credit_note_items"("credit_note_id");
ALTER TABLE "wholesale_credit_note_items" ADD CONSTRAINT "wholesale_credit_note_items_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "wholesale_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
