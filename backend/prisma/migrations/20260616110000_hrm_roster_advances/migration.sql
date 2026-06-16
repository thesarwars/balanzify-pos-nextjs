-- HRM phase 4: roster shifts, swaps, advances, todos
CREATE TABLE IF NOT EXISTS "roster_shifts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "location_id" UUID,
  "date" DATE NOT NULL,
  "start" VARCHAR(5) NOT NULL,
  "end" VARCHAR(5) NOT NULL,
  "role" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_shifts_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "roster_shifts_business_id_idx" ON "roster_shifts"("business_id");

CREATE TABLE IF NOT EXISTS "roster_swaps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "shift_id" UUID NOT NULL,
  "from_id" UUID NOT NULL,
  "to_id" UUID NOT NULL,
  "reason" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_swaps_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "roster_swaps_business_id_idx" ON "roster_swaps"("business_id");

CREATE TABLE IF NOT EXISTS "hr_advances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "advance_date" DATE NOT NULL,
  "account_id" UUID,
  "note" TEXT,
  "outstanding" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'outstanding',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_advances_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "hr_advances_business_id_idx" ON "hr_advances"("business_id");

CREATE TABLE IF NOT EXISTS "hr_todos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "assigned_to" UUID,
  "priority" VARCHAR(10) NOT NULL DEFAULT 'medium',
  "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
  "due_date" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_todos_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "hr_todos_business_id_idx" ON "hr_todos"("business_id");

ALTER TABLE "roster_shifts" ADD CONSTRAINT "rs_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "roster_shifts" ADD CONSTRAINT "rs_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
ALTER TABLE "roster_shifts" ADD CONSTRAINT "rs_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL;
ALTER TABLE "roster_swaps" ADD CONSTRAINT "rsw_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "roster_swaps" ADD CONSTRAINT "rsw_shift_fkey" FOREIGN KEY ("shift_id") REFERENCES "roster_shifts"("id") ON DELETE CASCADE;
ALTER TABLE "roster_swaps" ADD CONSTRAINT "rsw_from_fkey" FOREIGN KEY ("from_id") REFERENCES "employees"("id") ON DELETE CASCADE;
ALTER TABLE "roster_swaps" ADD CONSTRAINT "rsw_to_fkey" FOREIGN KEY ("to_id") REFERENCES "employees"("id") ON DELETE CASCADE;
ALTER TABLE "hr_advances" ADD CONSTRAINT "ha_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "hr_advances" ADD CONSTRAINT "ha_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
ALTER TABLE "hr_advances" ADD CONSTRAINT "ha_account_fkey" FOREIGN KEY ("account_id") REFERENCES "payment_accounts"("id") ON DELETE SET NULL;
ALTER TABLE "hr_todos" ADD CONSTRAINT "ht_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "hr_todos" ADD CONSTRAINT "ht_assignee_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employees"("id") ON DELETE SET NULL;
