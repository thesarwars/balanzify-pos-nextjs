-- Contacts: individual/business kind + assigned team member. Additive.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "assigned_to_id" UUID,
ADD COLUMN     "contact_kind" VARCHAR(10) NOT NULL DEFAULT 'business';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "assigned_to_id" UUID,
ADD COLUMN     "contact_kind" VARCHAR(10) NOT NULL DEFAULT 'individual';

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

