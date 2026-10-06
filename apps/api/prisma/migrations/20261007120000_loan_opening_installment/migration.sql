-- AlterTable
ALTER TABLE "FinanceLoan" ADD COLUMN     "installmentAccountId" TEXT,
ADD COLUMN     "installmentAmount" DOUBLE PRECISION,
ADD COLUMN     "installmentDay" INTEGER,
ADD COLUMN     "installmentLastMonth" TEXT,
ADD COLUMN     "installmentReminderKey" TEXT,
ADD COLUMN     "openingAmount" DOUBLE PRECISION,
ADD COLUMN     "openingDate" DATE,
ADD COLUMN     "openingNote" TEXT;

