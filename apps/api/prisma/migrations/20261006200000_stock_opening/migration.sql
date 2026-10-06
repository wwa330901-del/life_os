-- CreateTable
CREATE TABLE "StockOpeningPosition" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockOpeningPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockOpeningPosition_spaceId_stockCode_key" ON "StockOpeningPosition"("spaceId", "stockCode");

-- AddForeignKey
ALTER TABLE "StockOpeningPosition" ADD CONSTRAINT "StockOpeningPosition_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

