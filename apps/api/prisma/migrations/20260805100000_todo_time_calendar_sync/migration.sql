-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "sourceTodoId" TEXT;

-- AlterTable
ALTER TABLE "ProjectTodo" ADD COLUMN     "dueDateAllDay" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "dueDate" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceTodoId_key" ON "CalendarEvent"("sourceTodoId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_sourceTodoId_fkey" FOREIGN KEY ("sourceTodoId") REFERENCES "ProjectTodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

