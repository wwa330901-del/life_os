-- CreateEnum
CREATE TYPE "PermissionResourceType" AS ENUM ('PROJECT', 'TODOS', 'DOCUMENTS', 'VENDOR', 'QUOTATION', 'COST_CONTROL', 'PROCUREMENT', 'PAYMENT_REQUEST');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('WRITE', 'APPROVE', 'EXPORT');

-- AlterTable
ALTER TABLE "CompanyMembership" ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "rankId" TEXT;

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spaceId" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentRank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "DepartmentRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionRule" (
    "id" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "resourceType" "PermissionResourceType" NOT NULL,
    "spaceId" TEXT NOT NULL,
    "departmentId" TEXT,
    "rankId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "DepartmentRank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentRank" ADD CONSTRAINT "DepartmentRank_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRule" ADD CONSTRAINT "PermissionRule_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRule" ADD CONSTRAINT "PermissionRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRule" ADD CONSTRAINT "PermissionRule_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "DepartmentRank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

