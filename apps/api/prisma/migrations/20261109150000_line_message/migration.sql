-- CreateTable
CREATE TABLE "LineMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromUser" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "todoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineMessage_createdAt_idx" ON "LineMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "LineMessage" ADD CONSTRAINT "LineMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
