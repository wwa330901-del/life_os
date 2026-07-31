-- CreateEnum
CREATE TYPE "FinanceRecurringHolidayAdjustment" AS ENUM ('NONE', 'EARLIER', 'LATER');

-- AlterTable
ALTER TABLE "FinanceRecurringTransaction" ADD COLUMN     "holidayAdjustment" "FinanceRecurringHolidayAdjustment" NOT NULL DEFAULT 'NONE';
