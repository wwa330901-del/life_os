-- CreateEnum
CREATE TYPE "LifeGoalTrackingType" AS ENUM ('MANUAL', 'ACCOUNT_BALANCE', 'NET_WORTH', 'NOTE_KEYWORD_SUM', 'STOCK_VALUE', 'CHECK_IN');

-- CreateEnum
CREATE TYPE "LifeGoalPeriod" AS ENUM ('TOTAL', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "LifeGoal" ADD COLUMN     "checkInPeriod" "LifeGoalPeriod" NOT NULL DEFAULT 'TOTAL',
ADD COLUMN     "progressUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "requireCheckInNote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staleRemindedAt" TIMESTAMP(3),
ADD COLUMN     "trackingAccountId" TEXT,
ADD COLUMN     "trackingKeyword" TEXT,
ADD COLUMN     "trackingType" "LifeGoalTrackingType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "lifeGoalAiInteractionAt" TIMESTAMP(3),
ADD COLUMN     "lifeGoalAiInteractionId" TEXT;

-- CreateTable
CREATE TABLE "LifeGoalCheckIn" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "title" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifeGoalCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LifeGoalCheckIn_goalId_date_idx" ON "LifeGoalCheckIn"("goalId", "date");

-- AddForeignKey
ALTER TABLE "LifeGoal" ADD CONSTRAINT "LifeGoal_trackingAccountId_fkey" FOREIGN KEY ("trackingAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeGoalCheckIn" ADD CONSTRAINT "LifeGoalCheckIn_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "LifeGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
