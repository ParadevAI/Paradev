-- Custom SQL migration file, put your code below! --
-- Child first, then the organization it references (db-migrations rule 3).
DELETE FROM "environments" WHERE "organization_id" = '00000000-0000-0000-0000-000000000000';
DELETE FROM "auth"."organizations" WHERE "id" = '00000000-0000-0000-0000-000000000000';
