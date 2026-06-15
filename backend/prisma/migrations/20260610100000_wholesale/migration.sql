CREATE TABLE IF NOT EXISTS "wholesale_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL, "customer_id" UUID NOT NULL,
  "order_number" VARCHAR(30) NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "payment_status" VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0, "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "driver_name" VARCHAR(120), "delivery_notes" TEXT,
  "picked_at" TIMESTAMP(3), "delivered_at" TIMESTAMP(3), "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wholesale_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "wholesale_orders_order_number_key" ON "wholesale_orders"("order_number");
CREATE INDEX IF NOT EXISTS "wholesale_orders_business_id_status_idx" ON "wholesale_orders"("business_id","status");
CREATE TABLE IF NOT EXISTS "wholesale_order_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL, "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL, "unit_price" DECIMAL(12,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL, "picked" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "wholesale_order_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wo_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wo_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "woi_order_fkey" FOREIGN KEY ("order_id") REFERENCES "wholesale_orders"("id") ON DELETE CASCADE;
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "woi_product_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");
