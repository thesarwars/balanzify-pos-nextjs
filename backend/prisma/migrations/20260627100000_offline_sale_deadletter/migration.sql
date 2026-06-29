-- Dead-letter for offline sale ops that failed replay. An offline sale already
-- happened at the till; if /sync/push rejects it (deleted product, exhausted
-- stock, cart conflict) we must not silently lose the revenue. Capture it for
-- manual reconciliation instead.
CREATE TABLE "unsynced_sales" (
  "id"              UUID NOT NULL,
  "business_id"     UUID NOT NULL,
  "device_id"       VARCHAR(128) NOT NULL,
  "op_id"           VARCHAR(128) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "reason"          VARCHAR(40) NOT NULL,
  "error_message"   TEXT,
  "payload"         JSONB NOT NULL,
  "resolved"        BOOLEAN NOT NULL DEFAULT false,
  "resolved_at"     TIMESTAMP(3),
  "resolved_by"     UUID,
  "resolution"      VARCHAR(40),
  "created_by"      UUID,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unsynced_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unsynced_sales_business_id_device_id_op_id_key"
  ON "unsynced_sales" ("business_id", "device_id", "op_id");
CREATE INDEX "unsynced_sales_business_id_resolved_idx"
  ON "unsynced_sales" ("business_id", "resolved");

ALTER TABLE "unsynced_sales" ADD CONSTRAINT "unsynced_sales_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
