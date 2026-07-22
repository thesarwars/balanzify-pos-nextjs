-- Per-business SMTP config; the password is server-side only.
ALTER TABLE "businesses" ADD COLUMN "email_config" JSONB;
