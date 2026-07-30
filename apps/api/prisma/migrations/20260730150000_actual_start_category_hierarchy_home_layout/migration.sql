-- DropIndex
DROP INDEX "FinanceCategory_spaceId_name_kind_key";

-- AlterTable
ALTER TABLE "FinanceCategory" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "homeLayoutConfig" JSONB;

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "actualStartDate" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_spaceId_name_kind_parentId_key" ON "FinanceCategory"("spaceId", "name", "kind", "parentId");

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
