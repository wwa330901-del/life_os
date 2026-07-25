-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('PM', 'MEMBER');

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_userId_projectId_key" ON "ProjectMember"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: projects created before this migration have no ProjectMember
-- rows yet, and access is about to become membership-gated for non-
-- OWNER/ADMIN space roles. Without this, everyone who currently can see a
-- project would lose access the moment this deploys. Add every current
-- member of a project's space as a project member (the space's OWNER
-- becomes PM, everyone else becomes a regular MEMBER) so nobody's access
-- changes as a side effect of this migration — only newly created
-- projects going forward get the stricter "only its own members" rule via
-- ProjectsService.create explicitly adding just the creator as PM.
INSERT INTO "ProjectMember" ("id", "role", "userId", "projectId")
SELECT
    gen_random_uuid(),
    CASE WHEN cm."role" = 'OWNER' THEN 'PM'::"ProjectRole" ELSE 'MEMBER'::"ProjectRole" END,
    cm."userId",
    p."id"
FROM "Project" p
JOIN "CompanyMembership" cm ON cm."spaceId" = p."spaceId";
