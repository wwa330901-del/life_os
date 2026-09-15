-- CreateEnum
CREATE TYPE "FieldChangeEntityType" AS ENUM ('QUOTATION_LINE_ITEM', 'PROCUREMENT_COMPARISON');

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "generalManagerUserId" TEXT;

-- CreateTable
CREATE TABLE "FieldChangeLog" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "entityType" "FieldChangeEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldChangeLog_spaceId_entityType_entityId_idx" ON "FieldChangeLog"("spaceId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_generalManagerUserId_fkey" FOREIGN KEY ("generalManagerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldChangeLog" ADD CONSTRAINT "FieldChangeLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldChangeLog" ADD CONSTRAINT "FieldChangeLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

