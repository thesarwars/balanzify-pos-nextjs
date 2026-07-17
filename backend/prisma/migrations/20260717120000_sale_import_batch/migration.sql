-- Import Sales: every sale created by a bulk import is stamped with the batch it
-- came in on, so the Import Sales screen can list past imports and undo a whole
-- batch in one go. NULL for every sale that was rung up or invoiced normally —
-- no backfill needed, absence of a batch IS the correct value for those rows.
ALTER TABLE "sales" ADD COLUMN "import_batch" VARCHAR(64);

CREATE INDEX "sales_business_id_import_batch_idx" ON "sales" ("business_id", "import_batch");
