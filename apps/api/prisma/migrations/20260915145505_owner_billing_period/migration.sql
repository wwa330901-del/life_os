-- CreateTable
CREATE TABLE "OwnerBillingPeriod" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "requestDate" DATE NOT NULL,
    "note" TEXT,
    "contractAmountSnapshot" DOUBLE PRECISION NOT NULL,
    "billedPercentBefore" DOUBLE PRECISION NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerBillingPeriod_projectId_idx" ON "OwnerBillingPeriod"("projectId");

-- AddForeignKey
ALTER TABLE "OwnerBillingPeriod" ADD CONSTRAINT "OwnerBillingPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBillingPeriod" ADD CONSTRAINT "OwnerBillingPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

