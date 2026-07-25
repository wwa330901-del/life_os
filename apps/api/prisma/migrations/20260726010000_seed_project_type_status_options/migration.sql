-- Seed data only, no schema change — the initial "未分類" default (from
-- the previous migration) was just a placeholder to keep pre-existing
-- projects valid, not the real option set. These are the actual
-- 類型/狀態 choices the user wants available from day one.
INSERT INTO "ProjectTypeOption" ("id", "label", "sortOrder") VALUES
  (gen_random_uuid(), '設計', 1),
  (gen_random_uuid(), '工程', 2),
  (gen_random_uuid(), '設計工程', 3);

INSERT INTO "ProjectStatusOption" ("id", "label", "sortOrder") VALUES
  (gen_random_uuid(), '開發中', 1),
  (gen_random_uuid(), '進行中', 2),
  (gen_random_uuid(), '已結案', 3);
