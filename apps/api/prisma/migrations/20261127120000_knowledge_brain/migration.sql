-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "eventEndDate" DATE,
ADD COLUMN     "eventStartDate" DATE,
ADD COLUMN     "extraFilePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItemTopic" (
    "itemId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeItemTopic_pkey" PRIMARY KEY ("itemId","topicId")
);

-- CreateTable
CREATE TABLE "KnowledgeItemLink" (
    "id" TEXT NOT NULL,
    "fromItemId" TEXT NOT NULL,
    "toItemId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeTopic_ownerUserId_name_key" ON "KnowledgeTopic"("ownerUserId", "name");

-- CreateIndex
CREATE INDEX "KnowledgeItemTopic_topicId_idx" ON "KnowledgeItemTopic"("topicId");

-- CreateIndex
CREATE INDEX "KnowledgeItemLink_toItemId_idx" ON "KnowledgeItemLink"("toItemId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeItemLink_fromItemId_toItemId_key" ON "KnowledgeItemLink"("fromItemId", "toItemId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_ownerUserId_sourceKey_idx" ON "KnowledgeItem"("ownerUserId", "sourceKey");

-- CreateIndex
CREATE INDEX "KnowledgeItem_eventEndDate_idx" ON "KnowledgeItem"("eventEndDate");

-- AddForeignKey
ALTER TABLE "KnowledgeTopic" ADD CONSTRAINT "KnowledgeTopic_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItemTopic" ADD CONSTRAINT "KnowledgeItemTopic_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItemTopic" ADD CONSTRAINT "KnowledgeItemTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "KnowledgeTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItemLink" ADD CONSTRAINT "KnowledgeItemLink_fromItemId_fkey" FOREIGN KEY ("fromItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItemLink" ADD CONSTRAINT "KnowledgeItemLink_toItemId_fkey" FOREIGN KEY ("toItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 舊資料轉過來：每個分類名稱變成一個主題點，該分類的收藏都連到它。
INSERT INTO "KnowledgeTopic" ("id", "name", "ownerUserId")
SELECT gen_random_uuid()::text, c."name", i."ownerUserId"
FROM "KnowledgeItem" i JOIN "KnowledgeCategory" c ON c."id" = i."categoryId"
GROUP BY c."name", i."ownerUserId"
ON CONFLICT ("ownerUserId", "name") DO NOTHING;

INSERT INTO "KnowledgeItemTopic" ("itemId", "topicId")
SELECT i."id", t."id"
FROM "KnowledgeItem" i
JOIN "KnowledgeCategory" c ON c."id" = i."categoryId"
JOIN "KnowledgeTopic" t ON t."ownerUserId" = i."ownerUserId" AND t."name" = c."name"
ON CONFLICT DO NOTHING;

-- 舊的收藏當作已經看過，免得「還沒看」一下子跑出一大堆。
UPDATE "KnowledgeItem" SET "readAt" = "createdAt" WHERE "status" = 'DONE';

-- 舊的展覽：把「開始日期／結束日期」欄位搬到新的活動日期。
UPDATE "KnowledgeItem" i SET "eventEndDate" = v."dateValue"::date
FROM "KnowledgeFieldValue" v JOIN "KnowledgeFieldDefinition" d ON d."id" = v."definitionId"
WHERE v."itemId" = i."id" AND d."name" = '結束日期' AND v."dateValue" IS NOT NULL;

UPDATE "KnowledgeItem" i SET "eventStartDate" = v."dateValue"::date
FROM "KnowledgeFieldValue" v JOIN "KnowledgeFieldDefinition" d ON d."id" = v."definitionId"
WHERE v."itemId" = i."id" AND d."name" = '開始日期' AND v."dateValue" IS NOT NULL;
