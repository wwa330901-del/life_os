-- CreateTable
CREATE TABLE "AppAiSession" (
    "userId" TEXT NOT NULL,
    "aiInteractionId" TEXT,
    "aiInteractionAt" TIMESTAMP(3),
    "pendingAiAction" JSONB,
    "pendingAiActionTurn" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAiSession_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "AppAiSession" ADD CONSTRAINT "AppAiSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table (see 20260801190000_enable_row_level_security).
ALTER TABLE "AppAiSession" ENABLE ROW LEVEL SECURITY;
