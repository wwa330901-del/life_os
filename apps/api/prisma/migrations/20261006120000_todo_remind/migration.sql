-- LINE 短時間提醒（2026-10-06）：時間到推播，沒完成每天同一時間再提醒。
ALTER TABLE "ProjectTodo" ADD COLUMN "remindAt" TIMESTAMP(3);
ALTER TABLE "ProjectTodo" ADD COLUMN "remindCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ProjectTodo_remindAt_idx" ON "ProjectTodo"("remindAt");
