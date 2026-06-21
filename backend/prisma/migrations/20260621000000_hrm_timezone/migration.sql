-- Business-local timezone for HRM attendance time capture (EAT by default for
-- East-Africa markets). Defaults so existing rows clock in local wall-clock time.
ALTER TABLE "hrm_settings" ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi';
