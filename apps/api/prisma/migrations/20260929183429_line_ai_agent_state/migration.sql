/*
  Warnings:

  - You are about to drop the column `lifeGoalAiInteractionAt` on the `LineAccountLink` table. All the data in the column will be lost.
  - You are about to drop the column `lifeGoalAiInteractionId` on the `LineAccountLink` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LineAccountLink" DROP COLUMN "lifeGoalAiInteractionAt",
DROP COLUMN "lifeGoalAiInteractionId",
ADD COLUMN     "aiInteractionAt" TIMESTAMP(3),
ADD COLUMN     "aiInteractionId" TEXT,
ADD COLUMN     "pendingAiAction" JSONB,
ADD COLUMN     "pendingAiActionTurn" TEXT;
