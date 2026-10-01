-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "spendingAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "subscriptionReminderEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FinanceAlertLog" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAlertLog_spaceId_key_key" ON "FinanceAlertLog"("spaceId", "key");

-- AddForeignKey
ALTER TABLE "FinanceAlertLog" ADD CONSTRAINT "FinanceAlertLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

