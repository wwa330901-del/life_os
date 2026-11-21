-- AlterTable
ALTER TABLE "LifeGoalCheckIn" ADD COLUMN     "todoId" TEXT;

-- AlterTable
ALTER TABLE "ProjectTodo" ADD COLUMN     "lifeGoalId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectTodo_lifeGoalId_idx" ON "ProjectTodo"("lifeGoalId");

-- AddForeignKey
ALTER TABLE "ProjectTodo" ADD CONSTRAINT "ProjectTodo_lifeGoalId_fkey" FOREIGN KEY ("lifeGoalId") REFERENCES "LifeGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
