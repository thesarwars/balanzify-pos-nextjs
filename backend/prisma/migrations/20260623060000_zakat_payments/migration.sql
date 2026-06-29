-- Zakat / Sadaqah collection: charitable outflows recorded to the books.
CREATE TABLE "zakat_payments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recipient" VARCHAR(200),
    "method" VARCHAR(30) NOT NULL DEFAULT 'cash',
    "note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zakat_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "zakat_payments_business_id_idx" ON "zakat_payments"("business_id");
