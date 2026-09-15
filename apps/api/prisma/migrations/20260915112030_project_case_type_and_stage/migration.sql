-- CreateEnum
CREATE TYPE "ProjectCaseType" AS ENUM ('DESIGN', 'ENGINEERING', 'DESIGN_ENGINEERING');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('BUSINESS_CONTACT', 'DESIGN_CONTRACT', 'DESIGN_PHASE', 'ENGINEERING_QUOTATION', 'ENGINEERING_CONTRACT', 'PREPARATION', 'PROCUREMENT', 'CONSTRUCTION', 'COMPLETION_SETTLEMENT');

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_statusId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_typeId_fkey";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "statusId",
DROP COLUMN "typeId",
ADD COLUMN     "caseType" "ProjectCaseType",
ADD COLUMN     "skipDesignPhase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stage" "ProjectStage" NOT NULL DEFAULT 'BUSINESS_CONTACT';

-- DropTable
DROP TABLE "ProjectStatusOption";

-- DropTable
DROP TABLE "ProjectTypeOption";

