-- WhatsApp goes from click-to-chat links to real, trackable delivery: record
-- which provider sent each message and its delivery status so journeys (receipts,
-- credit reminders) are observable, not fire-and-forget.
ALTER TABLE "whatsapp_log" ADD COLUMN "provider" VARCHAR(20) NOT NULL DEFAULT 'link';
ALTER TABLE "whatsapp_log" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE "whatsapp_log" ADD COLUMN "provider_message_id" VARCHAR(128);
ALTER TABLE "whatsapp_log" ADD COLUMN "error_detail" TEXT;
CREATE INDEX "whatsapp_log_business_id_sent_at_idx" ON "whatsapp_log"("business_id", "sent_at");
