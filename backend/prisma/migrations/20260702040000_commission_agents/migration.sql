-- Sales commission agents (User Management). Additive.

-- CreateTable
CREATE TABLE "commission_agents" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "prefix" VARCHAR(10),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "email" VARCHAR(255),
    "phone" VARCHAR(40),
    "address" TEXT,
    "commission_percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_agents_business_id_idx" ON "commission_agents"("business_id");

-- AddForeignKey
ALTER TABLE "commission_agents" ADD CONSTRAINT "commission_agents_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

