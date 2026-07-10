-- Business settings preference bag (UltimatePOS-style Business Settings). Additive.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "settings" JSONB;

