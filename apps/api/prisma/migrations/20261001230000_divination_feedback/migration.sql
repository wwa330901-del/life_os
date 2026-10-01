-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "divinationFeedbackAt" TIMESTAMP(3),
ADD COLUMN     "divinationFeedbackId" TEXT;

-- AlterTable
ALTER TABLE "DivinationRecord" ADD COLUMN     "accuracy" INTEGER,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "feedbackAskedAt" TIMESTAMP(3),
ADD COLUMN     "feedbackAt" TIMESTAMP(3);

