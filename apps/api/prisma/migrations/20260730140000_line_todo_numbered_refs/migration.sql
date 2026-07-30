-- AlterTable
ALTER TABLE "LineAccountLink" DROP COLUMN "pendingDraft",
DROP COLUMN "pendingRichMenuId",
ADD COLUMN     "lastTodoListIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
