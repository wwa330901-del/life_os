-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "type" "StockTransactionType" NOT NULL,
    "pricePerShare" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "tradeDate" DATE NOT NULL,
    "settlementDate" DATE NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRecurringInvestment" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "holidayAdjustment" "FinanceRecurringHolidayAdjustment" NOT NULL DEFAULT 'NONE',
    "accountId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredMonth" TEXT,
    "awaitingReply" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockRecurringInvestment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPriceCache" (
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT,
    "dailyClosePrice" DOUBLE PRECISION,
    "dailyCloseDate" DATE,
    "intradayPrice" DOUBLE PRECISION,
    "intradayUpdatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockPriceCache_pkey" PRIMARY KEY ("stockCode")
);

-- CreateIndex
CREATE INDEX "StockTransaction_spaceId_stockCode_idx" ON "StockTransaction"("spaceId", "stockCode");

-- CreateIndex
CREATE INDEX "StockTransaction_settlementDate_settled_idx" ON "StockTransaction"("settlementDate", "settled");

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRecurringInvestment" ADD CONSTRAINT "StockRecurringInvestment_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRecurringInvestment" ADD CONSTRAINT "StockRecurringInvestment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
