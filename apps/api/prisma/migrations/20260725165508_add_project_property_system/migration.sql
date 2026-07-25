-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT');

-- CreateTable
CREATE TABLE "ProjectPropertyDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,

    CONSTRAINT "ProjectPropertyDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPropertyOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "definitionId" TEXT NOT NULL,

    CONSTRAINT "ProjectPropertyOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPropertyValue" (
    "id" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "optionId" TEXT,
    "projectId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,

    CONSTRAINT "ProjectPropertyValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPropertyValue_projectId_definitionId_key" ON "ProjectPropertyValue"("projectId", "definitionId");

-- AddForeignKey
ALTER TABLE "ProjectPropertyDefinition" ADD CONSTRAINT "ProjectPropertyDefinition_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPropertyOption" ADD CONSTRAINT "ProjectPropertyOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ProjectPropertyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPropertyValue" ADD CONSTRAINT "ProjectPropertyValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProjectPropertyOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPropertyValue" ADD CONSTRAINT "ProjectPropertyValue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPropertyValue" ADD CONSTRAINT "ProjectPropertyValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ProjectPropertyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
