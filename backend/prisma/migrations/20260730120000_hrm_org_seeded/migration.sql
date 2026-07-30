-- Seed departments/designations exactly once per business.
ALTER TABLE "hrm_settings" ADD COLUMN "org_seeded" BOOLEAN NOT NULL DEFAULT false;

-- Businesses that already have org units have clearly been seeded; mark them so
-- the one-time seeder does not run again and re-add the defaults on top.
INSERT INTO "hrm_settings" ("id", "business_id")
SELECT gen_random_uuid(), o."business_id"
FROM (SELECT DISTINCT "business_id" FROM "org_units") o
WHERE NOT EXISTS (SELECT 1 FROM "hrm_settings" h WHERE h."business_id" = o."business_id");

UPDATE "hrm_settings" SET "org_seeded" = true
WHERE "business_id" IN (SELECT DISTINCT "business_id" FROM "org_units");
