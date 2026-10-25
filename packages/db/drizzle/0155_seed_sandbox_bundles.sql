-- Custom SQL migration file, put your code below! --
INSERT INTO "sandbox_bundles" ("sha", "image_ref")
SELECT "bundle_sha", "source_ref" FROM "environments"
WHERE "organization_id" = '00000000-0000-0000-0000-000000000000'
  AND "name" = 'Default' AND "bundle_sha" IS NOT NULL
ON CONFLICT DO NOTHING;
