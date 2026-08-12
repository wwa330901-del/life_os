-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringInvestmentId" TEXT;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_recurringInvestmentId_fkey" FOREIGN KEY ("recurringInvestmentId") REFERENCES "StockRecurringInvestment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

