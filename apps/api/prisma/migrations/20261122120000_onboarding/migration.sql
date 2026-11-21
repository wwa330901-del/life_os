-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- 新手引導上線前就有的帳號不用再看
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP;
