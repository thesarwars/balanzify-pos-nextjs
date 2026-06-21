-- Offline-first sync: per-device cursors for terminals that sell offline and
-- reconcile via /sync (push outbox + delta pull).
CREATE TABLE "sync_devices" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id"  UUID NOT NULL,
  "device_id"    VARCHAR(128) NOT NULL,
  "user_id"      UUID,
  "label"        VARCHAR(120),
  "last_push_at" TIMESTAMP(3),
  "last_pull_at" TIMESTAMP(3),
  "pushed_ops"   INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sync_devices_business_id_device_id_key" ON "sync_devices"("business_id", "device_id");
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
