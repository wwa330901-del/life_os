-- CreateTable
CREATE TABLE "WorkItemVendor" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItemVendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkItemVendor_vendorId_idx" ON "WorkItemVendor"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemVendor_workItemId_vendorId_key" ON "WorkItemVendor"("workItemId", "vendorId");

-- AddForeignKey
ALTER TABLE "WorkItemVendor" ADD CONSTRAINT "WorkItemVendor_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItemVendor" ADD CONSTRAINT "WorkItemVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

