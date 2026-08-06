-- CreateEnum
CREATE TYPE "CostControlAdjustmentType" AS ENUM ('ADD', 'DEDUCT');

-- CreateTable
CREATE TABLE "QuotationLineItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costUnitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementComparison" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scopeName" TEXT NOT NULL,
    "finalAwardedAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "selectedVendorQuoteId" TEXT,

    CONSTRAINT "ProcurementComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementVendorQuote" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "quotedAmount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "attachmentFilePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementVendorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostControlRow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "procurementComparisonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostControlRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostControlRowQuotationItem" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "quotationLineItemId" TEXT NOT NULL,

    CONSTRAINT "CostControlRowQuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostControlAdjustment" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "type" "CostControlAdjustmentType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostControlAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "costControlRowId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "requestDate" DATE NOT NULL,
    "note" TEXT,
    "contractAmountSnapshot" DOUBLE PRECISION NOT NULL,
    "billedPercentBefore" DOUBLE PRECISION NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "salesManagerUserId" TEXT NOT NULL,
    "salesManagerStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "salesManagerComment" TEXT,
    "salesManagerDecidedAt" TIMESTAMP(3),
    "financeReviewUserId" TEXT NOT NULL,
    "financeReviewStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "financeReviewComment" TEXT,
    "financeReviewDecidedAt" TIMESTAMP(3),
    "costControlApproverUserId" TEXT NOT NULL,
    "costControlApproverStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "costControlApproverComment" TEXT,
    "costControlApproverDecidedAt" TIMESTAMP(3),
    "generalManagerUserId" TEXT NOT NULL,
    "generalManagerStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "generalManagerComment" TEXT,
    "generalManagerDecidedAt" TIMESTAMP(3),
    "accountingUserId" TEXT NOT NULL,
    "accountingStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "accountingComment" TEXT,
    "accountingDecidedAt" TIMESTAMP(3),
    "overallStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementComparison_selectedVendorQuoteId_key" ON "ProcurementComparison"("selectedVendorQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "CostControlRowQuotationItem_rowId_quotationLineItemId_key" ON "CostControlRowQuotationItem"("rowId", "quotationLineItemId");

-- CreateIndex
CREATE INDEX "PaymentRequest_costControlRowId_idx" ON "PaymentRequest"("costControlRowId");

-- AddForeignKey
ALTER TABLE "QuotationLineItem" ADD CONSTRAINT "QuotationLineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementComparison" ADD CONSTRAINT "ProcurementComparison_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementComparison" ADD CONSTRAINT "ProcurementComparison_selectedVendorQuoteId_fkey" FOREIGN KEY ("selectedVendorQuoteId") REFERENCES "ProcurementVendorQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementVendorQuote" ADD CONSTRAINT "ProcurementVendorQuote_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "ProcurementComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostControlRow" ADD CONSTRAINT "CostControlRow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostControlRow" ADD CONSTRAINT "CostControlRow_procurementComparisonId_fkey" FOREIGN KEY ("procurementComparisonId") REFERENCES "ProcurementComparison"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostControlRowQuotationItem" ADD CONSTRAINT "CostControlRowQuotationItem_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "CostControlRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostControlRowQuotationItem" ADD CONSTRAINT "CostControlRowQuotationItem_quotationLineItemId_fkey" FOREIGN KEY ("quotationLineItemId") REFERENCES "QuotationLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostControlAdjustment" ADD CONSTRAINT "CostControlAdjustment_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "CostControlRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_costControlRowId_fkey" FOREIGN KEY ("costControlRowId") REFERENCES "CostControlRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_salesManagerUserId_fkey" FOREIGN KEY ("salesManagerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_financeReviewUserId_fkey" FOREIGN KEY ("financeReviewUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_costControlApproverUserId_fkey" FOREIGN KEY ("costControlApproverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_generalManagerUserId_fkey" FOREIGN KEY ("generalManagerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_accountingUserId_fkey" FOREIGN KEY ("accountingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

