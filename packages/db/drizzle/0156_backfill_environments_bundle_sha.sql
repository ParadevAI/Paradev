-- Custom SQL migration file, put your code below! --
UPDATE "environments"
SET "bundle_sha" = (SELECT "sha" FROM "sandbox_bundles" ORDER BY "released_at" DESC LIMIT 1)
WHERE "bundle_sha" IS NULL;
