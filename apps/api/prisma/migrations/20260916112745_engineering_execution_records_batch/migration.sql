-- CreateEnum
CREATE TYPE "ContactRecordType" AS ENUM ('CONTACT_SHEET', 'MEETING_MINUTES');

-- CreateEnum
CREATE TYPE "MaterialSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "nextWeekPlan" TEXT,
    "issues" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContactRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ContactRecordType" NOT NULL,
    "recordDate" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attendees" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectContactRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionPhoto" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "photoDate" DATE NOT NULL,
    "caption" TEXT,
    "storagePath" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "spec" TEXT,
    "vendorId" TEXT,
    "status" "MaterialSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedDate" DATE NOT NULL,
    "reviewedDate" TIMESTAMP(3),
    "reviewComment" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_projectId_weekStartDate_key" ON "WeeklyReport"("projectId", "weekStartDate");

-- CreateIndex
CREATE INDEX "ProjectContactRecord_projectId_recordDate_idx" ON "ProjectContactRecord"("projectId", "recordDate");

-- CreateIndex
CREATE INDEX "ExecutionPhoto_projectId_photoDate_idx" ON "ExecutionPhoto"("projectId", "photoDate");

-- CreateIndex
CREATE INDEX "MaterialSubmission_projectId_status_idx" ON "MaterialSubmission"("projectId", "status");

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContactRecord" ADD CONSTRAINT "ProjectContactRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContactRecord" ADD CONSTRAINT "ProjectContactRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPhoto" ADD CONSTRAINT "ExecutionPhoto_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPhoto" ADD CONSTRAINT "ExecutionPhoto_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubmission" ADD CONSTRAINT "MaterialSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubmission" ADD CONSTRAINT "MaterialSubmission_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubmission" ADD CONSTRAINT "MaterialSubmission_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubmission" ADD CONSTRAINT "MaterialSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
