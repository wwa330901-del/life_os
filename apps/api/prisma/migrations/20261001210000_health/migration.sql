-- CreateEnum
CREATE TYPE "HealthRecordType" AS ENUM ('SLEEP', 'EXERCISE', 'WEIGHT', 'STEPS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "healthIngestToken" TEXT;

-- CreateTable
CREATE TABLE "HealthRecord" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "type" "HealthRecordType" NOT NULL,
    "date" DATE NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "value" DOUBLE PRECISION,
    "activity" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthRecord_ownerUserId_type_date_idx" ON "HealthRecord"("ownerUserId", "type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HealthRecord_ownerUserId_externalKey_key" ON "HealthRecord"("ownerUserId", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_healthIngestToken_key" ON "User"("healthIngestToken");

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Same as every other table (see 20260801190000_enable_row_level_security).
ALTER TABLE "HealthRecord" ENABLE ROW LEVEL SECURITY;
