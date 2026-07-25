-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_statusId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_typeId_fkey";

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "clientName" DROP NOT NULL,
ALTER COLUMN "siteAddress" DROP NOT NULL,
ALTER COLUMN "statusId" DROP NOT NULL,
ALTER COLUMN "typeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProjectTypeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ProjectStatusOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
