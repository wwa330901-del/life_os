-- CreateEnum
CREATE TYPE "WishlistStatus" AS ENUM ('WANT', 'BOUGHT', 'DROPPED');

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "wishlistMonthlyBudget" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "targetDate" DATE,
    "note" TEXT,
    "status" "WishlistStatus" NOT NULL DEFAULT 'WANT',
    "boughtAt" TIMESTAMP(3),
    "boughtPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistItem_spaceId_status_idx" ON "WishlistItem"("spaceId", "status");

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

