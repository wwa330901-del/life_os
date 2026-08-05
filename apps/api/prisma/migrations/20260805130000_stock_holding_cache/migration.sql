-- CreateTable
CREATE TABLE "StockHolding" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "costBasis" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockHolding_spaceId_stockCode_key" ON "StockHolding"("spaceId", "stockCode");

-- AddForeignKey
ALTER TABLE "StockHolding" ADD CONSTRAINT "StockHolding_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

