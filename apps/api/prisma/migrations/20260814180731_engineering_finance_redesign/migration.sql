-- CreateEnum
CREATE TYPE "ProcurementInspectionMethod" AS ENUM ('MONTHLY', 'MILESTONE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcurementPaymentMethod" AS ENUM ('MONTHLY_50_50', 'FULL_100', 'OTHER');

-- CreateEnum
CREATE TYPE "CostControlAdjustmentSide" AS ENUM ('OWNER', 'VENDOR');

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_accountingUserId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_costControlApproverUserId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_costControlRowId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_financeReviewUserId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_generalManagerUserId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_salesManagerUserId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequest" DROP CONSTRAINT "PaymentRequest_submittedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "QuotationLineItem" DROP CONSTRAINT "QuotationLineItem_projectId_fkey";

-- AlterTable
ALTER TABLE "CostControlAdjustment" ADD COLUMN     "side" "CostControlAdjustmentSide" NOT NULL;

-- AlterTable
ALTER TABLE "DocumentApproval" ADD COLUMN     "costControlInitialSheetId" TEXT,
ADD COLUMN     "paymentRequestPeriodId" TEXT,
ADD COLUMN     "procurementComparisonId" TEXT,
ALTER COLUMN "generatedDocumentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DocumentApprovalStep" ADD COLUMN     "roleLabel" TEXT;

-- AlterTable
ALTER TABLE "ProcurementComparison" DROP COLUMN "scopeName",
ADD COLUMN     "inspectionMethod" "ProcurementInspectionMethod" NOT NULL,
ADD COLUMN     "inspectionOtherNote" TEXT,
ADD COLUMN     "paymentMethod" "ProcurementPaymentMethod" NOT NULL,
ADD COLUMN     "paymentOtherNote" TEXT,
ADD COLUMN     "quotationLineItemId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ProcurementVendorQuote" DROP COLUMN "vendorName",
ADD COLUMN     "awardedAmount" DOUBLE PRECISION,
ADD COLUMN     "negotiatedAmount" DOUBLE PRECISION,
ADD COLUMN     "vendorId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QuotationLineItem" DROP COLUMN "projectId",
ADD COLUMN     "marginAdjustedUnitPrice" DOUBLE PRECISION,
ADD COLUMN     "negotiatedUnitPrice" DOUBLE PRECISION,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "quotationId" TEXT NOT NULL,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "unitPrice" DROP NOT NULL,
ALTER COLUMN "quantity" DROP NOT NULL,
ALTER COLUMN "costUnitPrice" DROP NOT NULL;

-- DropTable
DROP TABLE "PaymentRequest";

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankAccount" TEXT,
    "accountHolder" TEXT,
    "bankBranch" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringQuotation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lastTargetMarginPercent" DOUBLE PRECISION,
    "lastNegotiatedTotalAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngineeringQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationSurchargeItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "isTaxLike" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationSurchargeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostControlInitialSheet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lockedSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostControlInitialSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequestPeriod" (
    "id" TEXT NOT NULL,
    "costControlRowId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "requestDate" DATE NOT NULL,
    "note" TEXT,
    "additionalAmount" DOUBLE PRECISION,
    "additionalQuotationAttachmentPath" TEXT,
    "vendorNameSnapshot" TEXT NOT NULL,
    "vendorBankAccountSnapshot" TEXT,
    "vendorAccountHolderSnapshot" TEXT,
    "vendorBankBranchSnapshot" TEXT,
    "contractAmountSnapshot" DOUBLE PRECISION NOT NULL,
    "billedPercentBefore" DOUBLE PRECISION NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRequestPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_spaceId_idx" ON "Vendor"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringQuotation_projectId_key" ON "EngineeringQuotation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CostControlInitialSheet_projectId_key" ON "CostControlInitialSheet"("projectId");

-- CreateIndex
CREATE INDEX "PaymentRequestPeriod_costControlRowId_idx" ON "PaymentRequestPeriod"("costControlRowId");

-- CreateIndex
CREATE UNIQUE INDEX "CostControlRow_procurementComparisonId_key" ON "CostControlRow"("procurementComparisonId");

-- CreateIndex
CREATE INDEX "DocumentApproval_costControlInitialSheetId_idx" ON "DocumentApproval"("costControlInitialSheetId");

-- CreateIndex
CREATE INDEX "DocumentApproval_procurementComparisonId_idx" ON "DocumentApproval"("procurementComparisonId");

-- CreateIndex
CREATE INDEX "DocumentApproval_paymentRequestPeriodId_idx" ON "DocumentApproval"("paymentRequestPeriodId");

-- CreateIndex
CREATE INDEX "ProcurementComparison_projectId_idx" ON "ProcurementComparison"("projectId");

-- CreateIndex
CREATE INDEX "QuotationLineItem_quotationId_idx" ON "QuotationLineItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationLineItem_parentId_idx" ON "QuotationLineItem"("parentId");

-- AddForeignKey
ALTER TABLE "DocumentApproval" ADD CONSTRAINT "DocumentApproval_costControlInitialSheetId_fkey" FOREIGN KEY ("costControlInitialSheetId") REFERENCES "CostControlInitialSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApproval" ADD CONSTRAINT "DocumentApproval_procurementComparisonId_fkey" FOREIGN KEY ("procurementComparisonId") REFERENCES "ProcurementComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApproval" ADD CONSTRAINT "DocumentApproval_paymentRequestPeriodId_fkey" FOREIGN KEY ("paymentRequestPeriodId") REFERENCES "PaymentRequestPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringQuotation" ADD CONSTRAINT "EngineeringQuotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLineItem" ADD CONSTRAINT "QuotationLineItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "EngineeringQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLineItem" ADD CONSTRAINT "QuotationLineItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuotationLineItem"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "QuotationSurchargeItem" ADD CONSTRAINT "QuotationSurchargeItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "EngineeringQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostControlInitialSheet" ADD CONSTRAINT "CostControlInitialSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementVendorQuote" ADD CONSTRAINT "ProcurementVendorQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequestPeriod" ADD CONSTRAINT "PaymentRequestPeriod_costControlRowId_fkey" FOREIGN KEY ("costControlRowId") REFERENCES "CostControlRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequestPeriod" ADD CONSTRAINT "PaymentRequestPeriod_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

