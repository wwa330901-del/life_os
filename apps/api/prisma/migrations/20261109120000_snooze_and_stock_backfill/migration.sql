-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "pendingSnoozeAt" TIMESTAMP(3),
ADD COLUMN     "pendingSnoozeTodoId" TEXT;

-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "backfillFinanceTransactionId" TEXT;
