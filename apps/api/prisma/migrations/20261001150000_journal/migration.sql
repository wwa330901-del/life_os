-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "journalPromptAt" TIMESTAMP(3),
ADD COLUMN     "journalReminderEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "mood" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_ownerUserId_date_idx" ON "JournalEntry"("ownerUserId", "date");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table (see 20260801190000_enable_row_level_security).
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
