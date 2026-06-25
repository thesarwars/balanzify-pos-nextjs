-- B2B trade rails: merchant-to-merchant orders (distributor ↔ duka).

CREATE TABLE "trade_orders" (
    "id" UUID NOT NULL,
    "seller_business_id" UUID NOT NULL,
    "buyer_business_id" UUID NOT NULL,
    "order_number" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trade_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trade_orders_seller_business_id_status_idx" ON "trade_orders"("seller_business_id", "status");
CREATE INDEX "trade_orders_buyer_business_id_status_idx" ON "trade_orders"("buyer_business_id", "status");

CREATE TABLE "trade_order_items" (
    "id" UUID NOT NULL,
    "trade_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "trade_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trade_order_items_trade_order_id_idx" ON "trade_order_items"("trade_order_id");
ALTER TABLE "trade_order_items" ADD CONSTRAINT "trade_order_items_trade_order_id_fkey"
    FOREIGN KEY ("trade_order_id") REFERENCES "trade_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
