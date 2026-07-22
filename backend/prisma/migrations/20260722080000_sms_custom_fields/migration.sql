-- SMS engine (driver-based, server-side secrets) + dynamic custom fields.
ALTER TABLE "businesses" ADD COLUMN "sms_config" JSONB;

CREATE TABLE "sms_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "to" VARCHAR(30) NOT NULL,
    "message" TEXT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_logs_business_id_created_at_idx" ON "sms_logs"("business_id", "created_at");
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unlimited, per-entity custom field definitions; values ride on the entity
-- rows as JSONB keyed by definition id (no EAV joins).
CREATE TABLE "custom_field_defs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "entity" VARCHAR(20) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "field_type" VARCHAR(10) NOT NULL DEFAULT 'text',
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "custom_field_defs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "custom_field_defs_business_id_entity_idx" ON "custom_field_defs"("business_id", "entity");
ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customers" ADD COLUMN "custom_values" JSONB;
ALTER TABLE "products" ADD COLUMN "custom_values" JSONB;
