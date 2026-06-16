-- Superadmin / SaaS: packages, per-business subscriptions, payments, gateway settings
CREATE TABLE IF NOT EXISTS "packages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "interval" VARCHAR(10) NOT NULL DEFAULT 'monthly',
  "locations" INTEGER NOT NULL DEFAULT 1,
  "users" INTEGER NOT NULL DEFAULT 1,
  "products" INTEGER NOT NULL DEFAULT 100,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "packages_pkey" PRIMARY KEY ("id"));

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "package_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "expires_at" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_business_id_key" ON "subscriptions"("business_id");

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "gateway" VARCHAR(30) NOT NULL DEFAULT 'offline',
  "paid_at" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "subscription_payments_business_id_idx" ON "subscription_payments"("business_id");

CREATE TABLE IF NOT EXISTS "saas_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "singleton" BOOLEAN NOT NULL DEFAULT true,
  "gateways" JSONB NOT NULL DEFAULT '{"offline":true,"stripe":false}',
  CONSTRAINT "saas_settings_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX IF NOT EXISTS "saas_settings_singleton_key" ON "saas_settings"("singleton");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "sub_payments_business_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE;
