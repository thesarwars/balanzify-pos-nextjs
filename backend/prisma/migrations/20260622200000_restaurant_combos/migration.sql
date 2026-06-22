-- Restaurant combos / set menus: a fixed-price bundle of menu items.

CREATE TABLE "combos" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "combos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "combos_business_id_idx" ON "combos"("business_id");

CREATE TABLE "combo_items" (
    "id" UUID NOT NULL,
    "combo_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "combo_items_combo_id_idx" ON "combo_items"("combo_id");
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_fkey"
    FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
