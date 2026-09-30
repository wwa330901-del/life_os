-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "birthTime" TEXT;

-- CreateTable
CREATE TABLE "DivinationRecord" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "castAt" TIMESTAMP(3) NOT NULL,
    "hexagram" TEXT NOT NULL,
    "reading" JSONB NOT NULL,
    "interpretation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DivinationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DivinationRecord_ownerUserId_createdAt_idx" ON "DivinationRecord"("ownerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "DivinationRecord" ADD CONSTRAINT "DivinationRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table (see 20260801190000_enable_row_level_security).
ALTER TABLE "DivinationRecord" ENABLE ROW LEVEL SECURITY;
