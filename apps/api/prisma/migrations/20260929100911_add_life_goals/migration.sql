-- CreateEnum
CREATE TYPE "LifeGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "LifeGoal" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "category" TEXT,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION DEFAULT 0,
    "unit" TEXT,
    "targetDate" DATE,
    "status" "LifeGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LifeGoal_ownerUserId_status_idx" ON "LifeGoal"("ownerUserId", "status");

-- AddForeignKey
ALTER TABLE "LifeGoal" ADD CONSTRAINT "LifeGoal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
