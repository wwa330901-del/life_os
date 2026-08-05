-- CreateEnum
CREATE TYPE "CalendarShareDetailLevel" AS ENUM ('FULL', 'BUSY_ONLY');

-- CreateTable
CREATE TABLE "CalendarShare" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "detailLevel" "CalendarShareDetailLevel" NOT NULL DEFAULT 'FULL',
    "viewerColor" TEXT NOT NULL DEFAULT '#5B8DEF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarShare_ownerUserId_viewerUserId_key" ON "CalendarShare"("ownerUserId", "viewerUserId");

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

