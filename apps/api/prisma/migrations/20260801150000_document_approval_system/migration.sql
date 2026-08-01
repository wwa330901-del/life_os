-- CreateEnum
CREATE TYPE "DocumentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentApprovalStepNoteType" AS ENUM ('REQUEST_INFO', 'REPLY');

-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DocumentApproval" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "status" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentApprovalStep" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentApprovalStepNote" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "type" "DocumentApprovalStepNoteType" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentApprovalStepNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentApproval_generatedDocumentId_idx" ON "DocumentApproval"("generatedDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentApprovalStep_approvalId_sequence_key" ON "DocumentApprovalStep"("approvalId", "sequence");

-- CreateIndex
CREATE INDEX "DocumentApprovalStep_approverUserId_status_idx" ON "DocumentApprovalStep"("approverUserId", "status");

-- CreateIndex
CREATE INDEX "DocumentApprovalStepNote_stepId_idx" ON "DocumentApprovalStepNote"("stepId");

-- AddForeignKey
ALTER TABLE "DocumentApproval" ADD CONSTRAINT "DocumentApproval_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApproval" ADD CONSTRAINT "DocumentApproval_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalStep" ADD CONSTRAINT "DocumentApprovalStep_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "DocumentApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalStep" ADD CONSTRAINT "DocumentApprovalStep_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalStepNote" ADD CONSTRAINT "DocumentApprovalStepNote_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "DocumentApprovalStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalStepNote" ADD CONSTRAINT "DocumentApprovalStepNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
