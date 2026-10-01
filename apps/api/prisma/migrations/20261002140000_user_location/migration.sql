-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationIp" TEXT,
ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLon" DOUBLE PRECISION,
ADD COLUMN     "locationName" TEXT,
ADD COLUMN     "locationSource" TEXT,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3);

