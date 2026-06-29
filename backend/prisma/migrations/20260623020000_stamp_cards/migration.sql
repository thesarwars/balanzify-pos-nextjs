-- Stamp / punch-card loyalty ("buy 9, get 1 free").

CREATE TABLE "stamp_cards" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "product_id" UUID,
    "stamps_required" INTEGER NOT NULL,
    "reward" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stamp_cards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stamp_cards_business_id_idx" ON "stamp_cards"("business_id");

CREATE TABLE "customer_stamp_cards" (
    "id" UUID NOT NULL,
    "stamp_card_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_stamp_cards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_stamp_cards_stamp_card_id_customer_id_key" ON "customer_stamp_cards"("stamp_card_id", "customer_id");
CREATE INDEX "customer_stamp_cards_stamp_card_id_idx" ON "customer_stamp_cards"("stamp_card_id");
ALTER TABLE "customer_stamp_cards" ADD CONSTRAINT "customer_stamp_cards_stamp_card_id_fkey"
    FOREIGN KEY ("stamp_card_id") REFERENCES "stamp_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
