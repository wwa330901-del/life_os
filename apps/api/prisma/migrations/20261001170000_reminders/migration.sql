-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "morningBriefEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProjectTodo" ADD COLUMN     "dueReminderSentAt" TIMESTAMP(3);
