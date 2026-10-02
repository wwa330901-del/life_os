-- AI 改用 Claude（2026-10-02）：每個人自己的 Claude 金鑰、Agent 對話紀錄自己存。
ALTER TABLE "User" ADD COLUMN "claudeApiKey" TEXT;
ALTER TABLE "LineAccountLink" ADD COLUMN "aiMessages" JSONB;
ALTER TABLE "AppAiSession" ADD COLUMN "aiMessages" JSONB;
