-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN     "cardAutoPay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cardReminderKey" TEXT,
ADD COLUMN     "paymentAccountId" TEXT,
ADD COLUMN     "paymentDueDay" INTEGER,
ADD COLUMN     "statementDay" INTEGER;
