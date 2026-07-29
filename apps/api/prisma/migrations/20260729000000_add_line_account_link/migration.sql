
-- CreateTable
CREATE TABLE "LineAccountLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "linkCode" TEXT,
    "linkCodeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineAccountLink_userId_key" ON "LineAccountLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LineAccountLink_lineUserId_key" ON "LineAccountLink"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LineAccountLink_linkCode_key" ON "LineAccountLink"("linkCode");

-- AddForeignKey
ALTER TABLE "LineAccountLink" ADD CONSTRAINT "LineAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

