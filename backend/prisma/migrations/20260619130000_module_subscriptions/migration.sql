-- Per-business add-on module subscriptions (Stripe-backed billing)
CREATE TABLE "module_subscriptions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "stripe_customer_id" VARCHAR(255),
    "stripe_subscription_id" VARCHAR(255),
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "price_monthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "module_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "module_subscriptions_stripe_subscription_id_key" ON "module_subscriptions"("stripe_subscription_id");
CREATE UNIQUE INDEX "module_subscriptions_business_id_module_key" ON "module_subscriptions"("business_id", "module");
CREATE INDEX "module_subscriptions_business_id_idx" ON "module_subscriptions"("business_id");
ALTER TABLE "module_subscriptions" ADD CONSTRAINT "module_subscriptions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
