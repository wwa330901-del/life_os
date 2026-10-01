-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "goalReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reviewEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "todoReminderEnabled" BOOLEAN NOT NULL DEFAULT true;

