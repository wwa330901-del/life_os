-- AlterTable
ALTER TABLE "AppAiSession" ADD COLUMN     "aiRecentTurns" JSONB,
ADD COLUMN     "lastTurnId" TEXT;

-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "aiRecentTurns" JSONB;

