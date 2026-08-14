-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "characteristics" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "tradeCategory" TEXT;

-- AddForeignKey
ALTER TABLE "ProcurementComparison" ADD CONSTRAINT "ProcurementComparison_quotationLineItemId_fkey" FOREIGN KEY ("quotationLineItemId") REFERENCES "QuotationLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

