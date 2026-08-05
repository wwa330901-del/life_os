-- CreateTable
CREATE TABLE "FinanceLoanInvite" (
    "id" TEXT NOT NULL,
    "fromLoanId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdLoanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLoanInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLoanInvite_fromLoanId_key" ON "FinanceLoanInvite"("fromLoanId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLoanInvite_createdLoanId_key" ON "FinanceLoanInvite"("createdLoanId");

-- AddForeignKey
ALTER TABLE "FinanceLoanInvite" ADD CONSTRAINT "FinanceLoanInvite_fromLoanId_fkey" FOREIGN KEY ("fromLoanId") REFERENCES "FinanceLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLoanInvite" ADD CONSTRAINT "FinanceLoanInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLoanInvite" ADD CONSTRAINT "FinanceLoanInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLoanInvite" ADD CONSTRAINT "FinanceLoanInvite_createdLoanId_fkey" FOREIGN KEY ("createdLoanId") REFERENCES "FinanceLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

