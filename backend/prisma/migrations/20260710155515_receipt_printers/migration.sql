-- Receipt printers (thermal). charactersPerLine drives the ESC/POS layout. Additive.

-- CreateTable
CREATE TABLE "receipt_printers" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "connection_type" VARCHAR(20) NOT NULL DEFAULT 'network',
    "capability_profile" VARCHAR(30) NOT NULL DEFAULT 'default',
    "characters_per_line" INTEGER NOT NULL DEFAULT 42,
    "ip_address" VARCHAR(120),
    "port" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_printers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_printers_business_id_idx" ON "receipt_printers"("business_id");

-- AddForeignKey
ALTER TABLE "receipt_printers" ADD CONSTRAINT "receipt_printers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_printers" ADD CONSTRAINT "receipt_printers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

