-- Data-only migration: copies each space's current fixed 類型/狀態/業主名稱/
-- 專案地點/案號 into the new per-space ProjectPropertyDefinition/Option/Value
-- system (see schema.prisma / 大系統 doc for why this replaced the old
-- platform-wide ProjectTypeOption/ProjectStatusOption + fixed Project
-- columns). Additive only — the old columns/tables are untouched here,
-- kept as a safety net until the new system is verified in real use
-- (stage two of this rollout removes them in a later migration).
--
-- Only spaces that actually have a project get definitions — a space with
-- none has nothing to preserve and starts blank like any newly created
-- space going forward. Every *currently defined* type/status option (not
-- just ones some project happens to use) is copied in, so nothing an
-- admin already configured (e.g. the 設計/工程/設計工程,
-- 開發中/進行中/已結案 seed) silently disappears.
DO $$
DECLARE
  space_row RECORD;
  type_def_id TEXT;
  status_def_id TEXT;
  client_def_id TEXT;
  address_def_id TEXT;
  case_def_id TEXT;
  project_row RECORD;
BEGIN
  FOR space_row IN SELECT DISTINCT s.id FROM "Space" s JOIN "Project" p ON p."spaceId" = s.id LOOP
    type_def_id := gen_random_uuid();
    INSERT INTO "ProjectPropertyDefinition" (id, name, type, "sortOrder", "spaceId")
      VALUES (type_def_id, '類型', 'SELECT', 0, space_row.id);

    status_def_id := gen_random_uuid();
    INSERT INTO "ProjectPropertyDefinition" (id, name, type, "sortOrder", "spaceId")
      VALUES (status_def_id, '狀態', 'SELECT', 1, space_row.id);

    client_def_id := gen_random_uuid();
    INSERT INTO "ProjectPropertyDefinition" (id, name, type, "sortOrder", "spaceId")
      VALUES (client_def_id, '業主名稱', 'TEXT', 2, space_row.id);

    address_def_id := gen_random_uuid();
    INSERT INTO "ProjectPropertyDefinition" (id, name, type, "sortOrder", "spaceId")
      VALUES (address_def_id, '專案地點', 'TEXT', 3, space_row.id);

    case_def_id := gen_random_uuid();
    INSERT INTO "ProjectPropertyDefinition" (id, name, type, "sortOrder", "spaceId")
      VALUES (case_def_id, '案號', 'TEXT', 4, space_row.id);

    INSERT INTO "ProjectPropertyOption" (id, label, "sortOrder", "definitionId")
      SELECT gen_random_uuid(), label, "sortOrder", type_def_id FROM "ProjectTypeOption";
    INSERT INTO "ProjectPropertyOption" (id, label, "sortOrder", "definitionId")
      SELECT gen_random_uuid(), label, "sortOrder", status_def_id FROM "ProjectStatusOption";

    FOR project_row IN
      SELECT id, "clientName", "siteAddress", "caseNumber", "typeId", "statusId"
      FROM "Project" WHERE "spaceId" = space_row.id
    LOOP
      INSERT INTO "ProjectPropertyValue" (id, "projectId", "definitionId", "optionId")
        SELECT gen_random_uuid(), project_row.id, type_def_id, po.id
        FROM "ProjectPropertyOption" po
        JOIN "ProjectTypeOption" pto ON pto.label = po.label
        WHERE po."definitionId" = type_def_id AND pto.id = project_row."typeId";

      INSERT INTO "ProjectPropertyValue" (id, "projectId", "definitionId", "optionId")
        SELECT gen_random_uuid(), project_row.id, status_def_id, po.id
        FROM "ProjectPropertyOption" po
        JOIN "ProjectStatusOption" pso ON pso.label = po.label
        WHERE po."definitionId" = status_def_id AND pso.id = project_row."statusId";

      INSERT INTO "ProjectPropertyValue" (id, "projectId", "definitionId", "textValue")
        VALUES (gen_random_uuid(), project_row.id, client_def_id, project_row."clientName");

      INSERT INTO "ProjectPropertyValue" (id, "projectId", "definitionId", "textValue")
        VALUES (gen_random_uuid(), project_row.id, address_def_id, project_row."siteAddress");

      IF project_row."caseNumber" IS NOT NULL THEN
        INSERT INTO "ProjectPropertyValue" (id, "projectId", "definitionId", "textValue")
          VALUES (gen_random_uuid(), project_row.id, case_def_id, project_row."caseNumber");
      END IF;
    END LOOP;
  END LOOP;
END $$;
