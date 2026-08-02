-- AlterEnum
ALTER TYPE "PropertyType" ADD VALUE 'BOOLEAN';

-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "pendingKnowledgeItemId" TEXT,
ADD COLUMN     "pendingKnowledgeLocationQueryCategory" TEXT,
ADD COLUMN     "pendingExhibitionScheduleItemId" TEXT;

-- CreateEnum
CREATE TYPE "KnowledgeItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'AWAITING_CATEGORY_DECISION', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeExhibitionDecisionStatus" AS ENUM ('PENDING', 'SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "blacklistedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerUserId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFieldDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFieldOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "definitionId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" "KnowledgeItemStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedCategoryName" TEXT,
    "errorMessage" TEXT,
    "sourceUrl" TEXT,
    "sourcePlatform" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawContent" TEXT,
    "exhibitionDecisionStatus" "KnowledgeExhibitionDecisionStatus",
    "exhibitionPlannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeFieldValue" (
    "id" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "booleanValue" BOOLEAN,
    "optionId" TEXT,
    "itemId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_ownerUserId_name_key" ON "KnowledgeCategory"("ownerUserId", "name");

-- CreateIndex
CREATE INDEX "KnowledgeItem_ownerUserId_categoryId_idx" ON "KnowledgeItem"("ownerUserId", "categoryId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_status_idx" ON "KnowledgeItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeFieldValue_itemId_definitionId_key" ON "KnowledgeFieldValue"("itemId", "definitionId");

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFieldDefinition" ADD CONSTRAINT "KnowledgeFieldDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFieldOption" ADD CONSTRAINT "KnowledgeFieldOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "KnowledgeFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFieldValue" ADD CONSTRAINT "KnowledgeFieldValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "KnowledgeFieldOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFieldValue" ADD CONSTRAINT "KnowledgeFieldValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeFieldValue" ADD CONSTRAINT "KnowledgeFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "KnowledgeFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
