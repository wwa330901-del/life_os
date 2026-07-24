-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Bootstrap the platform admin and the first real company space.
-- Guarded with WHERE NOT EXISTS / re-runnable checks so this is a no-op on
-- any database that doesn't have this specific user (e.g. a fresh local
-- dev database), and safe to have run more than once.

UPDATE "User" SET "isPlatformAdmin" = true WHERE "email" = 'wwa330901@gmail.com';

INSERT INTO "Space" ("id", "type", "name", "createdAt")
SELECT gen_random_uuid(), 'COMPANY', '境為室內裝修設計', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Space" WHERE "name" = '境為室內裝修設計' AND "type" = 'COMPANY'
);

INSERT INTO "CompanyMembership" ("id", "role", "createdAt", "userId", "spaceId")
SELECT gen_random_uuid(), 'OWNER', CURRENT_TIMESTAMP, u."id", s."id"
FROM "User" u, "Space" s
WHERE u."email" = 'wwa330901@gmail.com'
  AND s."name" = '境為室內裝修設計' AND s."type" = 'COMPANY'
  AND NOT EXISTS (
    SELECT 1 FROM "CompanyMembership" cm WHERE cm."userId" = u."id" AND cm."spaceId" = s."id"
  );
