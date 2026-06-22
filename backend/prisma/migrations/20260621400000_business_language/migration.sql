-- Business UI/receipt language for localization (Somali/Arabic launch markets).
-- Arabic drives right-to-left rendering on the client.
ALTER TABLE "businesses" ADD COLUMN "language" VARCHAR(5) NOT NULL DEFAULT 'en';
