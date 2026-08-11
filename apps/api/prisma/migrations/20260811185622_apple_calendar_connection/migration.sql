-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "appleEventUid" TEXT;

-- CreateTable
CREATE TABLE "AppleCalendarConnection" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "appleId" TEXT NOT NULL,
    "appPassword" TEXT NOT NULL,
    "selectedCalendarUrls" TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppleCalendarConnection_spaceId_key" ON "AppleCalendarConnection"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_spaceId_appleEventUid_key" ON "CalendarEvent"("spaceId", "appleEventUid");

-- AddForeignKey
ALTER TABLE "AppleCalendarConnection" ADD CONSTRAINT "AppleCalendarConnection_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleCalendarConnection" ADD CONSTRAINT "AppleCalendarConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

