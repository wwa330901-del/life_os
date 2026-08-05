-- CreateEnum
CREATE TYPE "CalendarRecurrenceFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "recurrenceFrequency" "CalendarRecurrenceFrequency" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "recurrenceUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CalendarEventException" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventException_seriesId_occurrenceDate_key" ON "CalendarEventException"("seriesId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "CalendarEventException" ADD CONSTRAINT "CalendarEventException_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
