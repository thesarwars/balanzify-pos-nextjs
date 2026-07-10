-- Tax groups: a TaxRate whose rate is the sum of its sub-taxes. Additive.

-- AlterTable
ALTER TABLE "tax_rates" ADD COLUMN     "for_tax_group_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_tax_group" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tax_group_sub_taxes" (
    "id" UUID NOT NULL,
    "tax_group_id" UUID NOT NULL,
    "tax_rate_id" UUID NOT NULL,

    CONSTRAINT "tax_group_sub_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_group_sub_taxes_tax_rate_id_idx" ON "tax_group_sub_taxes"("tax_rate_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_group_sub_taxes_tax_group_id_tax_rate_id_key" ON "tax_group_sub_taxes"("tax_group_id", "tax_rate_id");

-- AddForeignKey
ALTER TABLE "tax_group_sub_taxes" ADD CONSTRAINT "tax_group_sub_taxes_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_group_sub_taxes" ADD CONSTRAINT "tax_group_sub_taxes_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

