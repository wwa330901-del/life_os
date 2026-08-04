-- CreateEnum
CREATE TYPE "FinanceLoanDirection" AS ENUM ('LEND', 'BORROW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinanceTransactionType" ADD VALUE 'LOAN_OUT';
ALTER TYPE "FinanceTransactionType" ADD VALUE 'LOAN_IN';
ALTER TYPE "FinanceTransactionType" ADD VALUE 'ADVANCE_OUT';
ALTER TYPE "FinanceTransactionType" ADD VALUE 'ADVANCE_IN';

-- AlterTable
ALTER TABLE "FinanceTransaction" ADD COLUMN     "advanceRepaymentId" TEXT,
ADD COLUMN     "financeAdvanceId" TEXT,
ADD COLUMN     "financeLoanId" TEXT,
ADD COLUMN     "loanRepaymentId" TEXT;

-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "lastAdvanceListIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastLoanListIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "FinanceLoan" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "direction" "FinanceLoanDirection" NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLoanRepayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAdvance" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAdvanceRepayment" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAdvanceRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransaction_financeLoanId_key" ON "FinanceTransaction"("financeLoanId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransaction_loanRepaymentId_key" ON "FinanceTransaction"("loanRepaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransaction_financeAdvanceId_key" ON "FinanceTransaction"("financeAdvanceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransaction_advanceRepaymentId_key" ON "FinanceTransaction"("advanceRepaymentId");

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_financeLoanId_fkey" FOREIGN KEY ("financeLoanId") REFERENCES "FinanceLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_loanRepaymentId_fkey" FOREIGN KEY ("loanRepaymentId") REFERENCES "FinanceLoanRepayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_financeAdvanceId_fkey" FOREIGN KEY ("financeAdvanceId") REFERENCES "FinanceAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_advanceRepaymentId_fkey" FOREIGN KEY ("advanceRepaymentId") REFERENCES "FinanceAdvanceRepayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLoan" ADD CONSTRAINT "FinanceLoan_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLoanRepayment" ADD CONSTRAINT "FinanceLoanRepayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "FinanceLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAdvance" ADD CONSTRAINT "FinanceAdvance_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAdvance" ADD CONSTRAINT "FinanceAdvance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAdvanceRepayment" ADD CONSTRAINT "FinanceAdvanceRepayment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "FinanceAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

