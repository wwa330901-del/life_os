-- CreateEnum
CREATE TYPE "CalendarSyncTarget" AS ENUM ('GOOGLE', 'ICLOUD');

-- AlterTable
ALTER TABLE "AppleCalendarConnection" ADD COLUMN     "writeCalendarUrl" TEXT;

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "appleEventEtag" TEXT,
ADD COLUMN     "appleEventHref" TEXT,
ADD COLUMN     "syncTarget" "CalendarSyncTarget";

-- AlterTable
ALTER TABLE "ProjectTodo" ADD COLUMN     "calendarSyncTarget" "CalendarSyncTarget";
