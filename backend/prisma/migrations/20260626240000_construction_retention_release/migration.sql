-- Construction: track retention release (held retention collected at end of defects period).
ALTER TABLE "project_milestones" ADD COLUMN "retention_released_at" TIMESTAMP(3);
