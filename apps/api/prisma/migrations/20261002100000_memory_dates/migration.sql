-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportantDate" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "isLunar" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "lastRemindedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportantDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMemory_ownerUserId_idx" ON "UserMemory"("ownerUserId");

-- CreateIndex
CREATE INDEX "ImportantDate_ownerUserId_idx" ON "ImportantDate"("ownerUserId");

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportantDate" ADD CONSTRAINT "ImportantDate_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

