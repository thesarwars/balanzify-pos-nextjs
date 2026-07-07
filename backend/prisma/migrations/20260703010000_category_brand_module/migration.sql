-- Category (code + parent hierarchy) & Brand (description + use_for_repair) modules. Additive.

-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "description" TEXT,
ADD COLUMN     "use_for_repair" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "parent_id" UUID;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

