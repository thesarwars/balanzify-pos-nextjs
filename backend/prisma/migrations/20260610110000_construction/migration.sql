CREATE TABLE IF NOT EXISTS "project_budget_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "category" VARCHAR(30) NOT NULL, "description" VARCHAR(255),
  "budgeted" DECIMAL(12,2) NOT NULL DEFAULT 0, "actual" DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT "project_budget_lines_pkey" PRIMARY KEY ("id"));
CREATE TABLE IF NOT EXISTS "labor_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "work_date" DATE NOT NULL, "workers" INTEGER NOT NULL DEFAULT 1,
  "daily_rate" DECIMAL(10,2) NOT NULL, "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" VARCHAR(255), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "labor_entries_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "labor_entries_project_id_work_date_idx" ON "labor_entries"("project_id","work_date");
CREATE TABLE IF NOT EXISTS "site_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "log_date" DATE NOT NULL, "notes" TEXT NOT NULL,
  "photo_urls" TEXT[] NOT NULL DEFAULT '{}', "logged_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_logs_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "site_logs_project_id_log_date_idx" ON "site_logs"("project_id","log_date");
CREATE TABLE IF NOT EXISTS "project_milestones" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL, "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "retention_pct" DECIMAL(5,2) NOT NULL DEFAULT 0, "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "completed_at" TIMESTAMP(3), "billed_at" TIMESTAMP(3), "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id"));
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "pbl_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "labor_entries" ADD CONSTRAINT "le_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "site_logs" ADD CONSTRAINT "sl_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_milestones" ADD CONSTRAINT "pm_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
