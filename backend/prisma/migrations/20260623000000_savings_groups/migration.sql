-- Savings groups (hagbad / ayuuto / chama): rotating savings circles.

CREATE TABLE "savings_groups" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contribution_amount" DECIMAL(12,2) NOT NULL,
    "frequency" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "current_cycle" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "savings_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "savings_groups_business_id_idx" ON "savings_groups"("business_id");

CREATE TABLE "savings_group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(50),
    "payout_position" INTEGER NOT NULL,
    "paid_out" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "savings_group_members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "savings_group_members_group_id_idx" ON "savings_group_members"("group_id");
ALTER TABLE "savings_group_members" ADD CONSTRAINT "savings_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "savings_contributions" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" VARCHAR(30) NOT NULL DEFAULT 'cash',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "savings_contributions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "savings_contributions_group_id_cycle_idx" ON "savings_contributions"("group_id", "cycle");
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "savings_payouts" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" VARCHAR(30) NOT NULL DEFAULT 'cash',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "savings_payouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "savings_payouts_group_id_idx" ON "savings_payouts"("group_id");
ALTER TABLE "savings_payouts" ADD CONSTRAINT "savings_payouts_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
