
-- CreateEnum
CREATE TYPE "TodoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "activeProjectId" TEXT;

-- CreateTable
CREATE TABLE "ProjectTodo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueDate" DATE,
    "priority" "TodoPriority" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "assigneeUserId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTodo_projectId_idx" ON "ProjectTodo"("projectId");

-- AddForeignKey
ALTER TABLE "LineAccountLink" ADD CONSTRAINT "LineAccountLink_activeProjectId_fkey" FOREIGN KEY ("activeProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTodo" ADD CONSTRAINT "ProjectTodo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTodo" ADD CONSTRAINT "ProjectTodo_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

