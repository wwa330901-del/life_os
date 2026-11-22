-- CreateTable
CREATE TABLE "SystemAlertLog" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAlertLog_pkey" PRIMARY KEY ("key")
);
