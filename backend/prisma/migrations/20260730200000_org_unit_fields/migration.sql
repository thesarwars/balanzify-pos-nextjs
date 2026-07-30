-- Departments and designations carry a description, and departments a short
-- human code ("Department ID" in the reference) distinct from the row's UUID.
ALTER TABLE "org_units"
  ADD COLUMN "code"        VARCHAR(50),
  ADD COLUMN "description" VARCHAR(500);
