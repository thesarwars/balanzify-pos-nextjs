-- Delivery: failed-attempt reason + COD driver settlement tracking.
ALTER TABLE "deliveries" ADD COLUMN "fail_reason" VARCHAR(255);
ALTER TABLE "deliveries" ADD COLUMN "settled_at" TIMESTAMP(3);
