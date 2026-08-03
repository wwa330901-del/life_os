-- AlterTable
ALTER TABLE "ProjectTodo" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "ProjectTodo" ADD COLUMN     "personalOwnerUserId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectTodo_personalOwnerUserId_idx" ON "ProjectTodo"("personalOwnerUserId");

-- AddForeignKey
ALTER TABLE "ProjectTodo" ADD CONSTRAINT "ProjectTodo_personalOwnerUserId_fkey" FOREIGN KEY ("personalOwnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one of projectId/personalOwnerUserId must be set — a 工作 todo
-- belongs to a project, a 個人 todo belongs directly to its owner, never
-- both and never neither.
ALTER TABLE "ProjectTodo" ADD CONSTRAINT "ProjectTodo_owner_xor_check" CHECK (
  (("projectId" IS NOT NULL)::int + ("personalOwnerUserId" IS NOT NULL)::int) = 1
);

-- AlterTable
ALTER TABLE "LineAccountLink" ADD COLUMN     "activeTodoPersonal" BOOLEAN NOT NULL DEFAULT false;
