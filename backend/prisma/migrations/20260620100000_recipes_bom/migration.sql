-- Recipe / BOM: menu items made from ingredient products
CREATE TABLE "recipes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "yield_qty" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipes_product_id_key" ON "recipes"("product_id");
CREATE INDEX "recipes_business_id_idx" ON "recipes"("business_id");

CREATE TABLE "recipe_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipe_id" UUID NOT NULL,
  "ingredient_id" UUID NOT NULL,
  "quantity" DECIMAL(12,4) NOT NULL,
  CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipe_items_recipe_id_ingredient_id_key" ON "recipe_items"("recipe_id","ingredient_id");
CREATE INDEX "recipe_items_recipe_id_idx" ON "recipe_items"("recipe_id");

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
