-- Suppliers get the same JSONB custom-field values customers and products
-- already carry (keyed by custom_field_defs id) — previously the shared
-- contact editor silently dropped them for suppliers.
ALTER TABLE "suppliers" ADD COLUMN "custom_values" JSONB;
