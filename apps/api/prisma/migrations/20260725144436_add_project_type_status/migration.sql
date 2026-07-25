-- CreateTable
CREATE TABLE "ProjectTypeOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTypeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStatusOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusOption_pkey" PRIMARY KEY ("id")
);

-- Seed a "未分類" default in each option table, at a fixed well-known id so the
-- backfill below can reference it directly.
INSERT INTO "ProjectTypeOption" ("id", "label", "sortOrder")
VALUES ('00000000-0000-0000-0000-000000000001', '未分類', 0);
INSERT INTO "ProjectStatusOption" ("id", "label", "sortOrder")
VALUES ('00000000-0000-0000-0000-000000000001', '未分類', 0);

-- AlterTable: add the new columns nullable first — existing projects predate
-- 類型/狀態/必填的業主/地點, so they need to be backfilled below before these
-- can be tightened to NOT NULL, or every pre-existing project row would
-- break this migration outright.
ALTER TABLE "Project" ADD COLUMN "caseNumber" TEXT;
ALTER TABLE "Project" ADD COLUMN "statusId" TEXT;
ALTER TABLE "Project" ADD COLUMN "typeId" TEXT;

-- Backfill: point every existing project at "未分類", and fill any missing
-- client/site text with an empty string, so nothing about them breaks or
-- disappears once these columns become required.
UPDATE "Project" SET "typeId" = '00000000-0000-0000-0000-000000000001' WHERE "typeId" IS NULL;
UPDATE "Project" SET "statusId" = '00000000-0000-0000-0000-000000000001' WHERE "statusId" IS NULL;
UPDATE "Project" SET "clientName" = '' WHERE "clientName" IS NULL;
UPDATE "Project" SET "siteAddress" = '' WHERE "siteAddress" IS NULL;

-- Now safe to require them going forward.
ALTER TABLE "Project" ALTER COLUMN "typeId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "statusId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "clientName" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "siteAddress" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProjectTypeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ProjectStatusOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
