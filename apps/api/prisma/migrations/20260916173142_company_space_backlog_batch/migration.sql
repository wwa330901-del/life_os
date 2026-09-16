-- CreateEnum
CREATE TYPE "PettyCashType" AS ENUM ('DEPOSIT', 'EXPENSE');

-- AlterTable
ALTER TABLE "OwnerBillingPeriod" ADD COLUMN     "collectedDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentRequestPeriod" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "invoiceAttachmentPath" TEXT,
ADD COLUMN     "paidDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PermissionRule" ADD COLUMN     "readOnlyFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "courtSeizureFlag" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PettyCashTransaction" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "transactionDate" DATE NOT NULL,
    "type" "PettyCashType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "purpose" TEXT NOT NULL,
    "projectId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PettyCashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PettyCashTransaction_spaceId_transactionDate_idx" ON "PettyCashTransaction"("spaceId", "transactionDate");

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
