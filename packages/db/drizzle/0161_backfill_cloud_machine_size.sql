-- Custom SQL migration file, put your code below! --
UPDATE "cloud_workspaces" SET "machine_size" = 'large' WHERE "machine_size" IS NULL;
