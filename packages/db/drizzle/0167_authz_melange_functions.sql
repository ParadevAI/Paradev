-- Custom SQL migration file, put your code below! --
-- Melange Migration (dry-run)
-- Melange version: 0.10.1
-- Schema checksum: 6ce68fd0230b4aa56d322ab91bcc1c12a4aa4b7192814fae193f3ffa75800fdf
-- Codegen version: 0.10.1

-- ============================================================
-- Database schema: authz
-- NOTE: You must create this schema before running the migration:
--   CREATE SCHEMA IF NOT EXISTS "authz";
-- ============================================================

-- ============================================================
-- DDL: Migration Tracking Table
-- ============================================================

-- Melange migrations tracking table
-- Stores migration history for change detection and orphan cleanup.
--
-- Each row represents a completed migration:
-- - melange_version: Version of the melange CLI/library (e.g., "v0.4.3")
-- - schema_checksum: SHA256 of the schema.fga content
-- - codegen_version: Version of the SQL generation logic
-- - function_names: All generated function names (for orphan detection)
-- - schema_dsl: The OpenFGA DSL that produced this migration (source for
--   "melange schema pull"; the exact content that was checksummed)
-- - schema_format: "single" or "modular" (fga.mod)
-- - model_json: The parsed model as JSON (machine-readable form for diffing)
--
-- The migrator checks the most recent record to determine if re-migration
-- is needed. If both checksum and codegen_version match, migration is skipped
-- unless --force is specified.

CREATE TABLE IF NOT EXISTS "authz"."melange_migrations" (
    id SERIAL PRIMARY KEY,
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    melange_version TEXT NOT NULL DEFAULT '',
    schema_checksum VARCHAR(64) NOT NULL,
    codegen_version TEXT NOT NULL,
    function_names TEXT[] NOT NULL,
    schema_dsl TEXT NOT NULL DEFAULT '',
    schema_format VARCHAR(16) NOT NULL DEFAULT '',
    model_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Lookup by checksum for change detection
CREATE INDEX IF NOT EXISTS idx_melange_migrations_checksum
ON "authz"."melange_migrations" (schema_checksum, codegen_version);



ALTER TABLE "authz"."melange_migrations"
ADD COLUMN IF NOT EXISTS melange_version TEXT NOT NULL DEFAULT '';



ALTER TABLE "authz"."melange_migrations"
ADD COLUMN IF NOT EXISTS function_checksums JSONB NOT NULL DEFAULT '{}';



DO $mig$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'melange_migrations'
          AND column_name = 'codegen_version'
          AND table_schema = 'authz'
          AND character_maximum_length IS NOT NULL
    ) THEN
        ALTER TABLE "authz"."melange_migrations" ALTER COLUMN codegen_version TYPE TEXT;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'melange_migrations'
          AND column_name = 'melange_version'
          AND table_schema = 'authz'
          AND character_maximum_length IS NOT NULL
    ) THEN
        ALTER TABLE "authz"."melange_migrations" ALTER COLUMN melange_version TYPE TEXT;
    END IF;
END
$mig$;



ALTER TABLE "authz"."melange_migrations"
ADD COLUMN IF NOT EXISTS schema_dsl TEXT NOT NULL DEFAULT '';
ALTER TABLE "authz"."melange_migrations"
ADD COLUMN IF NOT EXISTS schema_format VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE "authz"."melange_migrations"
ADD COLUMN IF NOT EXISTS model_json JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ============================================================
-- Check Functions (25 functions)
-- ============================================================

-- Generated check function for agent.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_agent_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'agent' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'agent' AND relation IN ('organization') AND object_id = p_object_id AND subject_type IN ('organization') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for agent.owner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_agent_owner"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'agent' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('owner')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'agent' AND relation IN ('owner') AND object_id = p_object_id AND subject_type IN ('user') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for channel.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_channel_member"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'channel' AND relation IN ('member') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for channel.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_channel_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'channel' AND relation IN ('organization') AND object_id = p_object_id AND subject_type IN ('organization') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for cloud_workspace.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_creator"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('creator') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for cloud_workspace.environment
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_environment"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('environment')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('environment') AND object_id = p_object_id AND subject_type IN ('environment') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for cloud_workspace.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('organization') AND object_id = p_object_id AND subject_type IN ('organization') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for cloud_workspace.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_shared_channel"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('shared_channel')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('shared_channel') AND object_id = p_object_id AND subject_type IN ('channel') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for environment.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_environment_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'environment' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'environment' AND relation IN ('organization') AND object_id = p_object_id AND subject_type IN ('organization') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for environment.runner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_environment_runner"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'environment' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('runner')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'environment' AND relation IN ('runner') AND object_id = p_object_id AND subject_type IN ('agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for organization.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_organization_member"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'organization' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'organization' AND relation IN ('member') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for page.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_page_creator"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'page' AND relation IN ('creator') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for page.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_page_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'page' AND relation IN ('organization') AND object_id = p_object_id AND subject_type IN ('organization') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for page.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_page_shared_channel"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('shared_channel')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'page' AND relation IN ('shared_channel') AND object_id = p_object_id AND subject_type IN ('channel') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for task.channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_task_channel"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('channel')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'task' AND relation IN ('channel') AND object_id = p_object_id AND subject_type IN ('channel') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for task.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_task_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'task' AND relation IN ('organization') AND object_id = p_object_id AND subject_type IN ('organization') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for channel.can_post
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."check_channel_can_post"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_post', 'member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'channel' AND relation IN ('can_post', 'member') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for channel.can_read
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."check_channel_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read', 'member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'channel' AND relation IN ('can_read', 'member') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for task.can_read
-- Features: Recursive
CREATE OR REPLACE FUNCTION "authz"."check_task_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_has_access BOOLEAN := FALSE;
    v_key TEXT := 'task:' || p_object_id || ':can_read';
    v_userset_check INTEGER := 0;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        RETURN 0;
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF NOT (v_has_access) THEN
        -- Recursive access path via channel -> member
        IF EXISTS (
    SELECT 1
    FROM melange_tuples AS link
    WHERE (link.object_type = 'task' AND link.relation IN ('channel') AND link.object_id = p_object_id AND "authz"."check_permission_internal"(p_subject_type, p_subject_id, 'member', link.subject_type, link.subject_id, p_visited || ARRAY[v_key]) = 1 AND link.subject_type IN ('channel'))
    ) THEN
        v_has_access := TRUE;
    END IF;
    END IF;
    IF v_has_access THEN
        RETURN 1;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated check function for task.can_write
-- Features: Recursive
CREATE OR REPLACE FUNCTION "authz"."check_task_can_write"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_has_access BOOLEAN := FALSE;
    v_key TEXT := 'task:' || p_object_id || ':can_write';
    v_userset_check INTEGER := 0;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        RETURN 0;
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_write')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF NOT (v_has_access) THEN
        -- Recursive access path via channel -> member
        IF EXISTS (
    SELECT 1
    FROM melange_tuples AS link
    WHERE (link.object_type = 'task' AND link.relation IN ('channel') AND link.object_id = p_object_id AND "authz"."check_permission_internal"(p_subject_type, p_subject_id, 'member', link.subject_type, link.subject_id, p_visited || ARRAY[v_key]) = 1 AND link.subject_type IN ('channel'))
    ) THEN
        v_has_access := TRUE;
    END IF;
    END IF;
    IF v_has_access THEN
        RETURN 1;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated check function for cloud_workspace.can_operate
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_can_operate"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_operate', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('can_operate', 'creator') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for cloud_workspace.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_has_access BOOLEAN := FALSE;
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':can_read';
    v_userset_check INTEGER := 0;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        RETURN 0;
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    -- Direct/Implied access path
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('can_read', 'creator') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        v_has_access := TRUE;
    END IF;
    IF NOT (v_has_access) THEN
        -- Recursive access path via shared_channel -> member
        IF EXISTS (
    SELECT 1
    FROM melange_tuples AS link
    WHERE (link.object_type = 'cloud_workspace' AND link.relation IN ('shared_channel') AND link.object_id = p_object_id AND "authz"."check_permission_internal"(p_subject_type, p_subject_id, 'member', link.subject_type, link.subject_id, p_visited || ARRAY[v_key]) = 1 AND link.subject_type IN ('channel'))
    ) THEN
        v_has_access := TRUE;
    END IF;
    END IF;
    IF v_has_access THEN
        RETURN 1;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated check function for environment.can_create_workspace
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."check_environment_can_create_workspace"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'environment' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_create_workspace', 'runner')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'environment' AND relation IN ('can_create_workspace', 'runner') AND object_id = p_object_id AND subject_type IN ('agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for page.can_edit
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."check_page_can_edit"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_userset_check INTEGER := 0;
BEGIN
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_edit', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'page' AND relation IN ('can_edit', 'creator') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated check function for page.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."check_page_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
DECLARE
    v_has_access BOOLEAN := FALSE;
    v_key TEXT := 'page:' || p_object_id || ':can_read';
    v_userset_check INTEGER := 0;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        RETURN 0;
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    -- Userset subject handling
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: Self-referential userset check
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    -- Direct/Implied access path
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'page' AND relation IN ('can_read', 'creator') AND object_id = p_object_id AND subject_type IN ('user', 'agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        v_has_access := TRUE;
    END IF;
    IF NOT (v_has_access) THEN
        -- Recursive access path via shared_channel -> member
        IF EXISTS (
    SELECT 1
    FROM melange_tuples AS link
    WHERE (link.object_type = 'page' AND link.relation IN ('shared_channel') AND link.object_id = p_object_id AND "authz"."check_permission_internal"(p_subject_type, p_subject_id, 'member', link.subject_type, link.subject_id, p_visited || ARRAY[v_key]) = 1 AND link.subject_type IN ('channel'))
    ) THEN
        v_has_access := TRUE;
    END IF;
    END IF;
    IF v_has_access THEN
        RETURN 1;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- ============================================================
-- No-Wildcard Check Functions (0 functions)
-- ============================================================

-- ============================================================
-- Check Dispatchers
-- ============================================================

-- Generated internal dispatcher for check_permission_internal
-- Routes to specialized functions with p_visited for cycle detection in TTU patterns
-- Enforces depth limit of 25 to prevent stack overflow from deep permission chains
-- Phase 5: All relations use specialized functions - no generic fallback
CREATE OR REPLACE FUNCTION "authz"."check_permission_internal"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
BEGIN
    -- Depth limit check: prevent excessively deep permission resolution chains
    -- This catches both recursive TTU patterns and long userset chains
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF p_object_type = 'agent' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_agent_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'owner' THEN
        RETURN "authz"."check_agent_owner"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'channel' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."check_channel_member"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_channel_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_post' THEN
        RETURN "authz"."check_channel_can_post"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_channel_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'cloud_workspace' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."check_cloud_workspace_creator"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'environment' THEN
        RETURN "authz"."check_cloud_workspace_environment"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_cloud_workspace_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."check_cloud_workspace_shared_channel"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."check_cloud_workspace_can_operate"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_cloud_workspace_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'environment' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_environment_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'runner' THEN
        RETURN "authz"."check_environment_runner"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_create_workspace' THEN
        RETURN "authz"."check_environment_can_create_workspace"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."check_organization_member"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'page' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."check_page_creator"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_page_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."check_page_shared_channel"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_edit' THEN
        RETURN "authz"."check_page_can_edit"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_page_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'task' THEN
        IF p_relation = 'channel' THEN
        RETURN "authz"."check_task_channel"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_task_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_task_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_write' THEN
        RETURN "authz"."check_task_can_write"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000;

-- Generated dispatcher for check_permission
-- Routes to specialized functions for all known type/relation pairs
CREATE OR REPLACE FUNCTION "authz"."check_permission"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_object_id TEXT
) RETURNS INTEGER AS $$
    SELECT "authz"."check_permission_internal"(p_subject_type, p_subject_id, p_relation, p_object_type, p_object_id, ARRAY[]::TEXT[]);
$$ LANGUAGE sql STABLE PARALLEL RESTRICTED;


-- Generated internal dispatcher for check_permission_nw_internal
-- Routes to specialized functions with p_visited for cycle detection in TTU patterns
-- Enforces depth limit of 25 to prevent stack overflow from deep permission chains
-- Phase 5: All relations use specialized functions - no generic fallback
CREATE OR REPLACE FUNCTION "authz"."check_permission_nw_internal"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER AS $$
BEGIN
    -- Depth limit check: prevent excessively deep permission resolution chains
    -- This catches both recursive TTU patterns and long userset chains
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF p_object_type = 'agent' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_agent_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'owner' THEN
        RETURN "authz"."check_agent_owner"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'channel' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."check_channel_member"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_channel_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_post' THEN
        RETURN "authz"."check_channel_can_post"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_channel_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'cloud_workspace' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."check_cloud_workspace_creator"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'environment' THEN
        RETURN "authz"."check_cloud_workspace_environment"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_cloud_workspace_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."check_cloud_workspace_shared_channel"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."check_cloud_workspace_can_operate"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_cloud_workspace_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'environment' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_environment_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'runner' THEN
        RETURN "authz"."check_environment_runner"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_create_workspace' THEN
        RETURN "authz"."check_environment_can_create_workspace"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."check_organization_member"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'page' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."check_page_creator"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_page_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."check_page_shared_channel"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_edit' THEN
        RETURN "authz"."check_page_can_edit"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_page_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'task' THEN
        IF p_relation = 'channel' THEN
        RETURN "authz"."check_task_channel"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."check_task_organization"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."check_task_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_write' THEN
        RETURN "authz"."check_task_can_write"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000;

-- Generated dispatcher for check_permission_nw
-- Routes to specialized functions for all known type/relation pairs
CREATE OR REPLACE FUNCTION "authz"."check_permission_nw"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_object_id TEXT
) RETURNS INTEGER AS $$
    SELECT "authz"."check_permission_nw_internal"(p_subject_type, p_subject_id, p_relation, p_object_type, p_object_id, ARRAY[]::TEXT[]);
$$ LANGUAGE sql STABLE PARALLEL RESTRICTED;


-- Generated bulk dispatcher for check_permission_bulk
-- Routes 25 (object_type, relation) pairs across 7 object types
-- Uses separate IF blocks to execute only branches for object types present in the batch
CREATE OR REPLACE FUNCTION "authz"."check_permission_bulk"(
    p_subject_types TEXT[],
    p_subject_ids TEXT[],
    p_relations TEXT[],
    p_object_types TEXT[],
    p_object_ids TEXT[]
) RETURNS TABLE(idx INTEGER, allowed INTEGER) AS $$
BEGIN
    IF 'agent' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'agent'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'agent' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('organization')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'organization' AND t.object_type = 'agent' AND t.object_id = r.object_id AND r.subject_type IN ('organization'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'organization'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'agent' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('owner')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'owner' AND t.object_type = 'agent' AND t.object_id = r.object_id AND r.subject_type IN ('user'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'owner'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('organization', 'owner');
    END IF;
    IF 'channel' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'channel'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'channel' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('member')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'member' AND t.object_type = 'channel' AND t.object_id = r.object_id AND r.subject_type IN ('user', 'agent'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'member'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'channel' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('organization')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'organization' AND t.object_type = 'channel' AND t.object_id = r.object_id AND r.subject_type IN ('organization'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'organization'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_channel_can_post"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_post'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_channel_can_read"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_read'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('member', 'organization', 'can_post', 'can_read');
    END IF;
    IF 'cloud_workspace' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'cloud_workspace'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'cloud_workspace' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('creator')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'creator' AND t.object_type = 'cloud_workspace' AND t.object_id = r.object_id AND r.subject_type IN ('user', 'agent'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'creator'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'cloud_workspace' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('environment')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'environment' AND t.object_type = 'cloud_workspace' AND t.object_id = r.object_id AND r.subject_type IN ('environment'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'environment'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'cloud_workspace' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('organization')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'organization' AND t.object_type = 'cloud_workspace' AND t.object_id = r.object_id AND r.subject_type IN ('organization'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'organization'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'cloud_workspace' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('shared_channel')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'shared_channel' AND t.object_type = 'cloud_workspace' AND t.object_id = r.object_id AND r.subject_type IN ('channel'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'shared_channel'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_cloud_workspace_can_operate"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_operate'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_cloud_workspace_can_read"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_read'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('creator', 'environment', 'organization', 'shared_channel', 'can_operate', 'can_read');
    END IF;
    IF 'environment' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'environment'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'environment' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('organization')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'organization' AND t.object_type = 'environment' AND t.object_id = r.object_id AND r.subject_type IN ('organization'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'organization'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'environment' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('runner')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'runner' AND t.object_type = 'environment' AND t.object_id = r.object_id AND r.subject_type IN ('agent'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'runner'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_environment_can_create_workspace"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_create_workspace'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('organization', 'runner', 'can_create_workspace');
    END IF;
    IF 'organization' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'organization'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'organization' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('member')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'member' AND t.object_type = 'organization' AND t.object_id = r.object_id AND r.subject_type IN ('user', 'agent'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'member'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('member');
    END IF;
    IF 'page' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'page'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'page' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('creator')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'creator' AND t.object_type = 'page' AND t.object_id = r.object_id AND r.subject_type IN ('user', 'agent'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'creator'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'page' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('organization')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'organization' AND t.object_type = 'page' AND t.object_id = r.object_id AND r.subject_type IN ('organization'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'organization'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'page' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('shared_channel')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'shared_channel' AND t.object_type = 'page' AND t.object_id = r.object_id AND r.subject_type IN ('channel'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'shared_channel'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_page_can_edit"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_edit'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_page_can_read"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_read'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('creator', 'organization', 'shared_channel', 'can_edit', 'can_read');
    END IF;
    IF 'task' = ANY(p_object_types) THEN
        RETURN QUERY
        WITH requests AS MATERIALIZED (
        SELECT t.* FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
            WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
            WHERE t.object_type = 'task'
    )
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'task' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('channel')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'channel' AND t.object_type = 'task' AND t.object_id = r.object_id AND r.subject_type IN ('channel'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'channel'
    
    UNION ALL
    
    		SELECT r.idx::INTEGER, CASE
            WHEN (r.subject_type = 'task' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('organization')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'organization' AND t.object_type = 'task' AND t.object_id = r.object_id AND r.subject_type IN ('organization'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'organization'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_task_can_read"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_read'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_task_can_write"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_write'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('channel', 'organization', 'can_read', 'can_write');
    END IF;
    RETURN QUERY
        SELECT t.idx::INTEGER, 0
    FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
      WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
    WHERE t.object_type NOT IN ('agent', 'channel', 'cloud_workspace', 'environment', 'organization', 'page', 'task');
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- ============================================================
-- Explain Functions (25 functions)
-- ============================================================

-- Generated explain function for agent.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_agent_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'agent:' || p_object_id || ':organization';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'agent' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'agent' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('organization'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for agent.owner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_agent_owner"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'agent:' || p_object_id || ':owner';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'owner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'owner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'agent' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('owner')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'owner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'agent' AND t.relation IN ('owner') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'owner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('agent' || ':' || p_object_id),
        'relation', 'owner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for channel.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_channel_member"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'channel:' || p_object_id || ':member';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'channel' AND t.relation IN ('member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for channel.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_channel_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'channel:' || p_object_id || ':organization';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'channel' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('organization'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for cloud_workspace.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_creator"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':creator';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for cloud_workspace.environment
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_environment"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':environment';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'environment',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'environment',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('environment')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'environment',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('environment') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('environment'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'environment',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'environment',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for cloud_workspace.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':organization';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('organization'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for cloud_workspace.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_shared_channel"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':shared_channel';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('shared_channel')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('shared_channel') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('channel'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for environment.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_environment_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'environment:' || p_object_id || ':organization';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'environment' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'environment' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('organization'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for environment.runner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_environment_runner"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'environment:' || p_object_id || ':runner';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'runner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'runner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'environment' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('runner')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'runner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'environment' AND t.relation IN ('runner') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'runner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'runner',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for organization.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_organization_member"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'organization:' || p_object_id || ':member';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('organization' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('organization' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'organization' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('organization' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'organization' AND t.relation IN ('member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('organization' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('organization' || ':' || p_object_id),
        'relation', 'member',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for page.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_page_creator"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'page:' || p_object_id || ':creator';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'page' AND t.relation IN ('creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'creator',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for page.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_page_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'page:' || p_object_id || ':organization';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'page' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('organization'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for page.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_page_shared_channel"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'page:' || p_object_id || ':shared_channel';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('shared_channel')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'page' AND t.relation IN ('shared_channel') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('channel'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'shared_channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for task.channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_task_channel"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'task:' || p_object_id || ':channel';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('channel')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'task' AND t.relation IN ('channel') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('channel'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'channel',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for task.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_task_organization"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'task:' || p_object_id || ':organization';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('organization')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'task' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('organization'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'organization',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for channel.can_post
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."explain_channel_can_post"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'channel:' || p_object_id || ':can_post';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_post',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_post',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_post', 'member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_post',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'channel' AND t.relation IN ('can_post', 'member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_post',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_post',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for channel.can_read
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."explain_channel_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'channel:' || p_object_id || ':can_read';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'channel' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read', 'member')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'channel' AND t.relation IN ('can_read', 'member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('channel' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for task.can_read
-- Features: Recursive
CREATE OR REPLACE FUNCTION "authz"."explain_task_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'task:' || p_object_id || ':can_read';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
    v_child_trace JSONB;
    v_parent_link RECORD;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- TTU / parent-relation attempts
    FOR v_parent_link IN
        SELECT link.subject_type AS parent_type, link.subject_id AS parent_id
    FROM melange_tuples AS link
    WHERE (link.object_type = 'task' AND link.relation IN ('channel') AND link.object_id = p_object_id AND link.subject_type IN ('channel'))
    LOOP
        v_child_trace := COALESCE("authz"."explain_permission_internal"(p_subject_type, p_subject_id, 'member', v_parent_link.parent_type, v_parent_link.parent_id, p_visited || ARRAY[v_key], p_max_nodes), '{}'::jsonb);
        v_node_count := v_node_count + COALESCE((v_child_trace->>'node_count')::INTEGER, 0);
        IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
        IF COALESCE((v_child_trace->>'result')::boolean, FALSE) THEN
        v_root := jsonb_build_object('type', 'ttu', 'label', ('via channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'ttu', 'label', ('via channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', false));
    END IF;
    END LOOP;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated explain function for task.can_write
-- Features: Recursive
CREATE OR REPLACE FUNCTION "authz"."explain_task_can_write"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'task:' || p_object_id || ':can_write';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
    v_child_trace JSONB;
    v_parent_link RECORD;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_write',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_write',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'task' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_write')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_write',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- TTU / parent-relation attempts
    FOR v_parent_link IN
        SELECT link.subject_type AS parent_type, link.subject_id AS parent_id
    FROM melange_tuples AS link
    WHERE (link.object_type = 'task' AND link.relation IN ('channel') AND link.object_id = p_object_id AND link.subject_type IN ('channel'))
    LOOP
        v_child_trace := COALESCE("authz"."explain_permission_internal"(p_subject_type, p_subject_id, 'member', v_parent_link.parent_type, v_parent_link.parent_id, p_visited || ARRAY[v_key], p_max_nodes), '{}'::jsonb);
        v_node_count := v_node_count + COALESCE((v_child_trace->>'node_count')::INTEGER, 0);
        IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_write',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
        IF COALESCE((v_child_trace->>'result')::boolean, FALSE) THEN
        v_root := jsonb_build_object('type', 'ttu', 'label', ('via channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_write',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'ttu', 'label', ('via channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', false));
    END IF;
    END LOOP;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('task' || ':' || p_object_id),
        'relation', 'can_write',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated explain function for cloud_workspace.can_operate
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_can_operate"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':can_operate';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_operate',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_operate',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_operate', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_operate',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_operate',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_operate',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for cloud_workspace.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':can_read';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
    v_child_trace JSONB;
    v_parent_link RECORD;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_read', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    -- TTU / parent-relation attempts
    FOR v_parent_link IN
        SELECT link.subject_type AS parent_type, link.subject_id AS parent_id
    FROM melange_tuples AS link
    WHERE (link.object_type = 'cloud_workspace' AND link.relation IN ('shared_channel') AND link.object_id = p_object_id AND link.subject_type IN ('channel'))
    LOOP
        v_child_trace := COALESCE("authz"."explain_permission_internal"(p_subject_type, p_subject_id, 'member', v_parent_link.parent_type, v_parent_link.parent_id, p_visited || ARRAY[v_key], p_max_nodes), '{}'::jsonb);
        v_node_count := v_node_count + COALESCE((v_child_trace->>'node_count')::INTEGER, 0);
        IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
        IF COALESCE((v_child_trace->>'result')::boolean, FALSE) THEN
        v_root := jsonb_build_object('type', 'ttu', 'label', ('via shared_channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'ttu', 'label', ('via shared_channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', false));
    END IF;
    END LOOP;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated explain function for environment.can_create_workspace
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."explain_environment_can_create_workspace"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'environment:' || p_object_id || ':can_create_workspace';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'can_create_workspace',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'can_create_workspace',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'environment' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_create_workspace', 'runner')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'can_create_workspace',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'environment' AND t.relation IN ('can_create_workspace', 'runner') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'can_create_workspace',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('environment' || ':' || p_object_id),
        'relation', 'can_create_workspace',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for page.can_edit
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."explain_page_can_edit"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'page:' || p_object_id || ':can_edit';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_edit',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_edit',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_edit', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_edit',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'page' AND t.relation IN ('can_edit', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_edit',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_edit',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- Generated explain function for page.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."explain_page_can_read"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'page:' || p_object_id || ':can_read';
    v_node_count INTEGER := 0;
    v_evidence_tuple RECORD;
    v_root JSONB;
    v_attempts JSONB := '[]'::JSONB;
    v_userset_check INTEGER := 0;
    v_max_nodes INTEGER := COALESCE(p_max_nodes, current_setting('melange.max_explain_nodes', true)::INTEGER, 100);
    v_truncated BOOLEAN := FALSE;
    v_child_trace JSONB;
    v_parent_link RECORD;
BEGIN
    -- Cycle detection
    IF v_key = ANY(p_visited) THEN
        v_root := jsonb_build_object('type', 'cycle', 'label', v_key);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    -- Userset subject handling (subject is itself a userset reference)
    IF position('#' in p_subject_id) > 0 THEN
        -- Case 1: self-referential userset (subject's userset resolves to this object)
        IF (p_subject_type = 'page' AND split_part(p_subject_id, '#', 1) = p_object_id) THEN
        SELECT INTO v_userset_check 1
    WHERE split_part(p_subject_id, '#', 2) IN ('can_read', 'creator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
    END IF;
    END IF;
    -- Direct/Implied grant attempt
    SELECT INTO v_evidence_tuple t.subject_type, t.subject_id, t.relation, t.object_type, t.object_id
    FROM melange_tuples AS t
    WHERE (t.object_type = 'page' AND t.relation IN ('can_read', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('user', 'agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', ('direct or implied grant via ' || v_evidence_tuple.relation), 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'direct', 'label', 'no direct grant', 'result', false));
    END IF;
    -- TTU / parent-relation attempts
    FOR v_parent_link IN
        SELECT link.subject_type AS parent_type, link.subject_id AS parent_id
    FROM melange_tuples AS link
    WHERE (link.object_type = 'page' AND link.relation IN ('shared_channel') AND link.object_id = p_object_id AND link.subject_type IN ('channel'))
    LOOP
        v_child_trace := COALESCE("authz"."explain_permission_internal"(p_subject_type, p_subject_id, 'member', v_parent_link.parent_type, v_parent_link.parent_id, p_visited || ARRAY[v_key], p_max_nodes), '{}'::jsonb);
        v_node_count := v_node_count + COALESCE((v_child_trace->>'node_count')::INTEGER, 0);
        IF v_node_count >= v_max_nodes THEN
        v_root := jsonb_build_object('type', 'truncated');
        v_node_count := v_node_count + 1;
        v_truncated := TRUE;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    END IF;
        IF COALESCE((v_child_trace->>'result')::boolean, FALSE) THEN
        v_root := jsonb_build_object('type', 'ttu', 'label', ('via shared_channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', true,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
    ELSE
        v_node_count := v_node_count + 1;
        v_attempts := v_attempts || jsonb_build_array(jsonb_build_object('type', 'ttu', 'label', ('via shared_channel → ' || v_parent_link.parent_type || ':' || v_parent_link.parent_id || ' ⇒ member'), 'children', jsonb_build_array(v_child_trace->'root'), 'result', false));
    END IF;
    END LOOP;
    IF v_node_count >= v_max_nodes THEN
        v_truncated := TRUE;
    END IF;
    -- All recorded attempts failed
    v_root := jsonb_build_object('type', 'union', 'children', v_attempts, 'result', false);
    v_node_count := v_node_count + 1;
    RETURN jsonb_build_object(
        'object', ('page' || ':' || p_object_id),
        'relation', 'can_read',
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', v_root,
        'truncated', v_truncated,
        'node_count', v_node_count);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000
SET search_path = 'authz';


-- Generated internal dispatcher for explain_permission
-- Routes (object_type, relation) to specialised explain_* functions
-- Returns a no-entry Trace JSONB when the pair is unknown so callers
-- never see NULL
CREATE OR REPLACE FUNCTION "authz"."explain_permission_internal"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    -- Depth limit check shared with check_permission_internal
    IF array_length(p_visited, 1) >= 25 THEN
        RAISE EXCEPTION 'resolution too complex' USING ERRCODE = 'M2002';
    END IF;
    IF p_object_type = 'agent' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."explain_agent_organization"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'owner' THEN
        RETURN "authz"."explain_agent_owner"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    IF p_object_type = 'channel' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."explain_channel_member"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."explain_channel_organization"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_post' THEN
        RETURN "authz"."explain_channel_can_post"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."explain_channel_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    IF p_object_type = 'cloud_workspace' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."explain_cloud_workspace_creator"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'environment' THEN
        RETURN "authz"."explain_cloud_workspace_environment"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."explain_cloud_workspace_organization"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."explain_cloud_workspace_shared_channel"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."explain_cloud_workspace_can_operate"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."explain_cloud_workspace_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    IF p_object_type = 'environment' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."explain_environment_organization"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'runner' THEN
        RETURN "authz"."explain_environment_runner"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_create_workspace' THEN
        RETURN "authz"."explain_environment_can_create_workspace"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."explain_organization_member"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    IF p_object_type = 'page' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."explain_page_creator"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."explain_page_organization"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."explain_page_shared_channel"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_edit' THEN
        RETURN "authz"."explain_page_can_edit"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."explain_page_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    IF p_object_type = 'task' THEN
        IF p_relation = 'channel' THEN
        RETURN "authz"."explain_task_channel"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."explain_task_organization"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."explain_task_can_read"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_write' THEN
        RETURN "authz"."explain_task_can_write"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
    END IF;
    RETURN jsonb_build_object(
        'object', (p_object_type || ':' || p_object_id),
        'relation', p_relation,
        'subject', (p_subject_type || ':' || p_subject_id),
        'result', false,
        'root', jsonb_build_object('type', 'union', 'label', 'explain not yet supported for this (object_type, relation) — no generated explain function for the requested pair. Confirm the pair exists in the migrated schema.', 'children', '[]'::jsonb, 'result', false),
        'truncated', false,
        'node_count', 1);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED COST 1000;

-- Generated public dispatcher for explain_permission
-- Companion to check_permission — returns a JSONB Trace describing
-- why the check decision was reached
CREATE OR REPLACE FUNCTION "authz"."explain_permission"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_object_id TEXT,
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
    SELECT "authz"."explain_permission_internal"(p_subject_type, p_subject_id, p_relation, p_object_type, p_object_id, ARRAY[]::TEXT[], p_max_nodes);
$$ LANGUAGE sql STABLE PARALLEL RESTRICTED;


-- ============================================================
-- Expand Functions (25 functions)
-- ============================================================

-- Generated expand function for agent.organization
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_agent_organization"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('agent' || ':' || p_object_id || '#organization')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'agent' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'agent' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for agent.owner
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_agent_owner"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('agent' || ':' || p_object_id || '#owner')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'agent' AND object_id = p_object_id AND relation = 'owner' AND subject_type IN ('user') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'agent' AND object_id = p_object_id AND relation = 'owner' AND subject_type IN ('user') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for channel.member
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_channel_member"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('channel' || ':' || p_object_id || '#member')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'channel' AND object_id = p_object_id AND relation = 'member' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'channel' AND object_id = p_object_id AND relation = 'member' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for channel.organization
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_channel_organization"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('channel' || ':' || p_object_id || '#organization')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'channel' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'channel' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for cloud_workspace.creator
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_creator"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#creator')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'creator' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'creator' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for cloud_workspace.environment
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_environment"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#environment')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'environment' AND subject_type IN ('environment') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'environment' AND subject_type IN ('environment') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for cloud_workspace.organization
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_organization"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#organization')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for cloud_workspace.shared_channel
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_shared_channel"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#shared_channel')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'shared_channel' AND subject_type IN ('channel') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'shared_channel' AND subject_type IN ('channel') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for environment.organization
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_environment_organization"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('environment' || ':' || p_object_id || '#organization')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'environment' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'environment' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for environment.runner
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_environment_runner"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('environment' || ':' || p_object_id || '#runner')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'environment' AND object_id = p_object_id AND relation = 'runner' AND subject_type IN ('agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'environment' AND object_id = p_object_id AND relation = 'runner' AND subject_type IN ('agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for organization.member
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_organization_member"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('organization' || ':' || p_object_id || '#member')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'organization' AND object_id = p_object_id AND relation = 'member' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'organization' AND object_id = p_object_id AND relation = 'member' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for page.creator
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_page_creator"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('page' || ':' || p_object_id || '#creator')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'creator' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'creator' AND subject_type IN ('user', 'agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for page.organization
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_page_organization"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('page' || ':' || p_object_id || '#organization')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for page.shared_channel
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_page_shared_channel"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('page' || ':' || p_object_id || '#shared_channel')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'shared_channel' AND subject_type IN ('channel') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'shared_channel' AND subject_type IN ('channel') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for task.channel
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_task_channel"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('task' || ':' || p_object_id || '#channel')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'task' AND object_id = p_object_id AND relation = 'channel' AND subject_type IN ('channel') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'task' AND object_id = p_object_id AND relation = 'channel' AND subject_type IN ('channel') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for task.organization
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_task_organization"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('task' || ':' || p_object_id || '#organization')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'task' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'task' AND object_id = p_object_id AND relation = 'organization' AND subject_type IN ('organization') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for channel.can_post
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_channel_can_post"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('channel' || ':' || p_object_id || '#can_post')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('channel' || ':' || p_object_id || '#member')))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for channel.can_read
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_channel_can_read"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('channel' || ':' || p_object_id || '#can_read')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('channel' || ':' || p_object_id || '#member')))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for task.can_read
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_task_can_read"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('task' || ':' || p_object_id || '#can_read')) || jsonb_build_object('leaf', jsonb_build_object('tuple_to_userset', jsonb_build_object('tupleset', ('task' || ':' || p_object_id || '#channel'), 'computed', COALESCE((SELECT jsonb_agg(jsonb_build_object('userset', subject_type || ':' || subject_id || '#member') ORDER BY subject_type, subject_id) FROM "authz"."melange_tuples" WHERE object_type = 'task' AND object_id = p_object_id AND relation = 'channel' AND subject_type IN ('channel')), '[]'::jsonb)))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for task.can_write
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_task_can_write"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('task' || ':' || p_object_id || '#can_write')) || jsonb_build_object('leaf', jsonb_build_object('tuple_to_userset', jsonb_build_object('tupleset', ('task' || ':' || p_object_id || '#channel'), 'computed', COALESCE((SELECT jsonb_agg(jsonb_build_object('userset', subject_type || ':' || subject_id || '#member') ORDER BY subject_type, subject_id) FROM "authz"."melange_tuples" WHERE object_type = 'task' AND object_id = p_object_id AND relation = 'channel' AND subject_type IN ('channel')), '[]'::jsonb)))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for cloud_workspace.can_operate
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_can_operate"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#can_operate')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('cloud_workspace' || ':' || p_object_id || '#creator')))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for cloud_workspace.can_read
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_can_read"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#can_read')) || jsonb_build_object('union', jsonb_build_object('nodes', jsonb_build_array(jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#can_read')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('cloud_workspace' || ':' || p_object_id || '#creator')))), jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#can_read')) || jsonb_build_object('leaf', jsonb_build_object('tuple_to_userset', jsonb_build_object('tupleset', ('cloud_workspace' || ':' || p_object_id || '#shared_channel'), 'computed', COALESCE((SELECT jsonb_agg(jsonb_build_object('userset', subject_type || ':' || subject_id || '#member') ORDER BY subject_type, subject_id) FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'shared_channel' AND subject_type IN ('channel')), '[]'::jsonb))))))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for environment.can_create_workspace
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_environment_can_create_workspace"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('environment' || ':' || p_object_id || '#can_create_workspace')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('environment' || ':' || p_object_id || '#runner')))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for page.can_edit
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_page_can_edit"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('page' || ':' || p_object_id || '#can_edit')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('page' || ':' || p_object_id || '#creator')))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated expand function for page.can_read
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_page_can_read"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('page' || ':' || p_object_id || '#can_read')) || jsonb_build_object('union', jsonb_build_object('nodes', jsonb_build_array(jsonb_build_object('name', ('page' || ':' || p_object_id || '#can_read')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('page' || ':' || p_object_id || '#creator')))), jsonb_build_object('name', ('page' || ':' || p_object_id || '#can_read')) || jsonb_build_object('leaf', jsonb_build_object('tuple_to_userset', jsonb_build_object('tupleset', ('page' || ':' || p_object_id || '#shared_channel'), 'computed', COALESCE((SELECT jsonb_agg(jsonb_build_object('userset', subject_type || ':' || subject_id || '#member') ORDER BY subject_type, subject_id) FROM "authz"."melange_tuples" WHERE object_type = 'page' AND object_id = p_object_id AND relation = 'shared_channel' AND subject_type IN ('channel')), '[]'::jsonb))))))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;


-- Generated internal dispatcher for expand_permission
-- Routes (object_type, relation) to specialised expand_* functions
-- Returns an empty Leaf.Users sentinel for unknown / not-yet-supported
-- pairs so OpenFGA tooling deserialises without special-casing.
-- Callers that need to distinguish 'no one has access' from 'expand
-- not supported for this relation' should compare against Check.
CREATE OR REPLACE FUNCTION "authz"."expand_permission_internal"(
    p_object_type TEXT,
    p_object_id TEXT,
    p_relation TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    IF p_object_type = 'agent' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."expand_agent_organization"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'owner' THEN
        RETURN "authz"."expand_agent_owner"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'channel' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."expand_channel_member"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."expand_channel_organization"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_post' THEN
        RETURN "authz"."expand_channel_can_post"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."expand_channel_can_read"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'cloud_workspace' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."expand_cloud_workspace_creator"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'environment' THEN
        RETURN "authz"."expand_cloud_workspace_environment"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."expand_cloud_workspace_organization"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."expand_cloud_workspace_shared_channel"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."expand_cloud_workspace_can_operate"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."expand_cloud_workspace_can_read"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'environment' THEN
        IF p_relation = 'organization' THEN
        RETURN "authz"."expand_environment_organization"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'runner' THEN
        RETURN "authz"."expand_environment_runner"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_create_workspace' THEN
        RETURN "authz"."expand_environment_can_create_workspace"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."expand_organization_member"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'page' THEN
        IF p_relation = 'creator' THEN
        RETURN "authz"."expand_page_creator"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."expand_page_organization"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN "authz"."expand_page_shared_channel"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_edit' THEN
        RETURN "authz"."expand_page_can_edit"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."expand_page_can_read"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'task' THEN
        IF p_relation = 'channel' THEN
        RETURN "authz"."expand_task_channel"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'organization' THEN
        RETURN "authz"."expand_task_organization"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN "authz"."expand_task_can_read"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_write' THEN
        RETURN "authz"."expand_task_can_write"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;

-- Generated public dispatcher for expand_permission
-- Companion to list_accessible_subjects — returns an OpenFGA-shaped
-- UsersetTree JSONB describing who has the relation on the object.
-- Shallow by default: computed/TTU rewrites surface as unresolved
-- pointers (use Checker.ExpandRecursive client-side to chase).
CREATE OR REPLACE FUNCTION "authz"."expand_permission"(
    p_object_type TEXT,
    p_object_id TEXT,
    p_relation TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
    SELECT "authz"."expand_permission_internal"(p_object_type, p_object_id, p_relation, p_subject_type, p_max_leaf);
$$ LANGUAGE sql STABLE PARALLEL RESTRICTED;


-- ============================================================
-- List Objects Functions (25 functions)
-- ============================================================

-- Generated list_objects function for agent.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_agent_organization_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'agent' AND t.relation IN ('organization') AND t.subject_type = p_subject_type AND p_subject_type IN ('organization') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'agent' AND split_part(p_subject_id, '#', 2) IN ('organization'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for agent.owner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_agent_owner_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'agent' AND t.relation IN ('owner') AND t.subject_type = p_subject_type AND p_subject_type IN ('user') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'agent' AND split_part(p_subject_id, '#', 2) IN ('owner'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for channel.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_channel_member_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('member') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'channel' AND split_part(p_subject_id, '#', 2) IN ('member'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for channel.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_channel_organization_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('organization') AND t.subject_type = p_subject_type AND p_subject_type IN ('organization') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'channel' AND split_part(p_subject_id, '#', 2) IN ('organization'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for cloud_workspace.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_creator_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('creator') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('creator'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for cloud_workspace.environment
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_environment_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('environment') AND t.subject_type = p_subject_type AND p_subject_type IN ('environment') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('environment'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for cloud_workspace.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_organization_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('organization') AND t.subject_type = p_subject_type AND p_subject_type IN ('organization') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('organization'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for cloud_workspace.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_shared_channel_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('shared_channel') AND t.subject_type = p_subject_type AND p_subject_type IN ('channel') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('shared_channel'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for environment.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_environment_organization_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'environment' AND t.relation IN ('organization') AND t.subject_type = p_subject_type AND p_subject_type IN ('organization') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'environment' AND split_part(p_subject_id, '#', 2) IN ('organization'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for environment.runner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_environment_runner_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'environment' AND t.relation IN ('runner') AND t.subject_type = p_subject_type AND p_subject_type IN ('agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'environment' AND split_part(p_subject_id, '#', 2) IN ('runner'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for organization.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_organization_member_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'organization' AND t.relation IN ('member') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'organization' AND split_part(p_subject_id, '#', 2) IN ('member'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for page.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_page_creator_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('creator') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'page' AND split_part(p_subject_id, '#', 2) IN ('creator'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for page.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_page_organization_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('organization') AND t.subject_type = p_subject_type AND p_subject_type IN ('organization') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'page' AND split_part(p_subject_id, '#', 2) IN ('organization'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for page.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_page_shared_channel_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('shared_channel') AND t.subject_type = p_subject_type AND p_subject_type IN ('channel') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'page' AND split_part(p_subject_id, '#', 2) IN ('shared_channel'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for task.channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_task_channel_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'task' AND t.relation IN ('channel') AND t.subject_type = p_subject_type AND p_subject_type IN ('channel') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'task' AND split_part(p_subject_id, '#', 2) IN ('channel'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for task.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_task_organization_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'task' AND t.relation IN ('organization') AND t.subject_type = p_subject_type AND p_subject_type IN ('organization') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'task' AND split_part(p_subject_id, '#', 2) IN ('organization'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for channel.can_post
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_channel_can_post_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('can_post', 'member') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'channel' AND split_part(p_subject_id, '#', 2) IN ('can_post', 'member'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for channel.can_read
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_channel_can_read_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('can_read', 'member') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'channel' AND split_part(p_subject_id, '#', 2) IN ('can_read', 'member'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for task.can_read
-- Features: Recursive
-- Indirect anchor: channel.member via ttu
CREATE OR REPLACE FUNCTION "authz"."list_task_can_read_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    -- Type guard: only return results if subject type is allowed
    -- Skip the guard for userset subjects since composed inner calls handle userset subjects
    IF (position('#' in p_subject_id) = 0 AND p_subject_type NOT IN ('user', 'agent')) THEN
        RETURN;
    END IF;
    RETURN QUERY
        WITH base_results AS (
            -- TTU composition: channel -> channel
                SELECT DISTINCT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'task' AND t.relation = 'channel' AND t.subject_type = 'channel' AND t.subject_id IN (SELECT obj.object_id FROM "authz"."list_channel_member_obj"(p_subject_type, p_subject_id, NULL, NULL) obj))
                UNION
            SELECT split_part(p_subject_id, '#', 1) AS object_id
            WHERE (p_subject_type = 'task' AND position('#' in p_subject_id) > 0 AND split_part(p_subject_id, '#', 2) IN ('can_read'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for task.can_write
-- Features: Recursive
-- Indirect anchor: channel.member via ttu
CREATE OR REPLACE FUNCTION "authz"."list_task_can_write_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    -- Type guard: only return results if subject type is allowed
    -- Skip the guard for userset subjects since composed inner calls handle userset subjects
    IF (position('#' in p_subject_id) = 0 AND p_subject_type NOT IN ('user', 'agent')) THEN
        RETURN;
    END IF;
    RETURN QUERY
        WITH base_results AS (
            -- TTU composition: channel -> channel
                SELECT DISTINCT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'task' AND t.relation = 'channel' AND t.subject_type = 'channel' AND t.subject_id IN (SELECT obj.object_id FROM "authz"."list_channel_member_obj"(p_subject_type, p_subject_id, NULL, NULL) obj))
                UNION
            SELECT split_part(p_subject_id, '#', 1) AS object_id
            WHERE (p_subject_type = 'task' AND position('#' in p_subject_id) > 0 AND split_part(p_subject_id, '#', 2) IN ('can_write'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for cloud_workspace.can_operate
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_can_operate_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'creator') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('can_operate', 'creator'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for cloud_workspace.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_can_read_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            WITH channel_member_objs AS (
                SELECT o.object_id
                FROM "authz"."list_channel_member_obj"(p_subject_type, p_subject_id, NULL, NULL) AS o
            ),
            accessible(object_id) AS (
                -- Direct tuple lookup with simple closure relations
                    SELECT DISTINCT t.object_id
                    FROM melange_tuples AS t
                    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_read', 'creator') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                    UNION
                    -- Cross-type TTU subject-first: shared_channel -> channel.member
                    SELECT DISTINCT child.object_id
                    FROM channel_member_objs AS parent_obj
                    INNER JOIN melange_tuples AS child ON (child.object_type = 'cloud_workspace' AND child.relation = 'shared_channel' AND child.subject_type = 'channel' AND child.subject_id = parent_obj.object_id)
                    UNION
                    -- Cross-type TTU userset-subject parity: shared_channel -> member
                    SELECT DISTINCT child.object_id
                    FROM melange_tuples AS child
                    WHERE (child.object_type = 'cloud_workspace' AND child.relation IN ('shared_channel') AND child.subject_type IN ('channel') AND position('#' in p_subject_id) > 0 AND "authz"."check_permission_internal"(p_subject_type, p_subject_id, 'member', child.subject_type, child.subject_id, ARRAY[]::TEXT[]) = 1)
            )
            SELECT DISTINCT acc.object_id
            FROM accessible AS acc
                UNION
            SELECT split_part(p_subject_id, '#', 1) AS object_id
            WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('can_read', 'creator'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for environment.can_create_workspace
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_environment_can_create_workspace_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'environment' AND t.relation IN ('can_create_workspace', 'runner') AND t.subject_type = p_subject_type AND p_subject_type IN ('agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'environment' AND split_part(p_subject_id, '#', 2) IN ('can_create_workspace', 'runner'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for page.can_edit
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_page_can_edit_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            -- Direct tuple lookup with simple closure relations
                -- Type guard: only return results if subject type is in allowed subject types
                SELECT t.object_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('can_edit', 'creator') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'page' AND split_part(p_subject_id, '#', 2) IN ('can_edit', 'creator'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_objects function for page.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."list_page_can_read_obj"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    RETURN QUERY
        WITH base_results AS (
            WITH channel_member_objs AS (
                SELECT o.object_id
                FROM "authz"."list_channel_member_obj"(p_subject_type, p_subject_id, NULL, NULL) AS o
            ),
            accessible(object_id) AS (
                -- Direct tuple lookup with simple closure relations
                    SELECT DISTINCT t.object_id
                    FROM melange_tuples AS t
                    WHERE (t.object_type = 'page' AND t.relation IN ('can_read', 'creator') AND t.subject_type = p_subject_type AND p_subject_type IN ('user', 'agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                    UNION
                    -- Cross-type TTU subject-first: shared_channel -> channel.member
                    SELECT DISTINCT child.object_id
                    FROM channel_member_objs AS parent_obj
                    INNER JOIN melange_tuples AS child ON (child.object_type = 'page' AND child.relation = 'shared_channel' AND child.subject_type = 'channel' AND child.subject_id = parent_obj.object_id)
                    UNION
                    -- Cross-type TTU userset-subject parity: shared_channel -> member
                    SELECT DISTINCT child.object_id
                    FROM melange_tuples AS child
                    WHERE (child.object_type = 'page' AND child.relation IN ('shared_channel') AND child.subject_type IN ('channel') AND position('#' in p_subject_id) > 0 AND "authz"."check_permission_internal"(p_subject_type, p_subject_id, 'member', child.subject_type, child.subject_id, ARRAY[]::TEXT[]) = 1)
            )
            SELECT DISTINCT acc.object_id
            FROM accessible AS acc
                UNION
            SELECT split_part(p_subject_id, '#', 1) AS object_id
            WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'page' AND split_part(p_subject_id, '#', 2) IN ('can_read', 'creator'))
        ),
        paged AS (
            SELECT br.object_id
            FROM base_results br
            WHERE (p_after IS NULL OR br.object_id > p_after)
            ORDER BY br.object_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.object_id FROM paged p ORDER BY p.object_id LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT max(r.object_id) FROM returned r)
            END AS next_cursor
        )
        SELECT r.object_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- ============================================================
-- List Subjects Functions (25 functions)
-- ============================================================

-- Generated list_subjects function for agent.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_agent_organization_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'agent' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('organization', 'member', 'member')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'organization', 'agent', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'agent' AND v_filter_relation IN ('organization'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('organization') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'agent' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for agent.owner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_agent_owner_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'agent' AND t.relation IN ('owner') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'owner', 'agent', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'agent' AND v_filter_relation IN ('owner'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'agent' AND t.relation IN ('owner') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for channel.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_channel_member_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'channel' AND t.relation IN ('member') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'member', 'channel', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'channel' AND v_filter_relation IN ('member'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for channel.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_channel_organization_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'channel' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('organization', 'member', 'member')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'organization', 'channel', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'channel' AND v_filter_relation IN ('organization'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('organization') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for cloud_workspace.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_creator_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('creator') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'creator'), ('cloud_workspace', 'can_read', 'can_read'), ('cloud_workspace', 'can_read', 'creator'), ('cloud_workspace', 'creator', 'creator'), ('cloud_workspace', 'environment', 'environment'), ('cloud_workspace', 'organization', 'organization'), ('cloud_workspace', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'creator', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('creator'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for cloud_workspace.environment
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_environment_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('environment') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'creator'), ('cloud_workspace', 'can_read', 'can_read'), ('cloud_workspace', 'can_read', 'creator'), ('cloud_workspace', 'creator', 'creator'), ('cloud_workspace', 'environment', 'environment'), ('cloud_workspace', 'organization', 'organization'), ('cloud_workspace', 'shared_channel', 'shared_channel'), ('environment', 'can_create_workspace', 'can_create_workspace'), ('environment', 'can_create_workspace', 'runner'), ('environment', 'organization', 'organization'), ('environment', 'runner', 'runner')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'environment', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('environment'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('environment') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('environment') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for cloud_workspace.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_organization_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'creator'), ('cloud_workspace', 'can_read', 'can_read'), ('cloud_workspace', 'can_read', 'creator'), ('cloud_workspace', 'creator', 'creator'), ('cloud_workspace', 'environment', 'environment'), ('cloud_workspace', 'organization', 'organization'), ('cloud_workspace', 'shared_channel', 'shared_channel'), ('organization', 'member', 'member')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'organization', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('organization'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('organization') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for cloud_workspace.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_shared_channel_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('shared_channel') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'creator'), ('cloud_workspace', 'can_read', 'can_read'), ('cloud_workspace', 'can_read', 'creator'), ('cloud_workspace', 'creator', 'creator'), ('cloud_workspace', 'environment', 'environment'), ('cloud_workspace', 'organization', 'organization'), ('cloud_workspace', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'shared_channel', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('shared_channel'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('channel') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('shared_channel') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for environment.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_environment_organization_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'environment' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('environment', 'can_create_workspace', 'can_create_workspace'), ('environment', 'can_create_workspace', 'runner'), ('environment', 'organization', 'organization'), ('environment', 'runner', 'runner'), ('organization', 'member', 'member')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'organization', 'environment', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'environment' AND v_filter_relation IN ('organization'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('organization') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'environment' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for environment.runner
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_environment_runner_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'environment' AND t.relation IN ('runner') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('environment', 'can_create_workspace', 'can_create_workspace'), ('environment', 'can_create_workspace', 'runner'), ('environment', 'organization', 'organization'), ('environment', 'runner', 'runner')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'runner', 'environment', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'environment' AND v_filter_relation IN ('runner'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'environment' AND t.relation IN ('runner') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for organization.member
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_organization_member_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'organization' AND t.relation IN ('member') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('organization', 'member', 'member')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'member', 'organization', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'organization' AND v_filter_relation IN ('member'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'organization' AND t.relation IN ('member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for page.creator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_page_creator_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'page' AND t.relation IN ('creator') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('page', 'can_edit', 'can_edit'), ('page', 'can_edit', 'creator'), ('page', 'can_read', 'can_read'), ('page', 'can_read', 'creator'), ('page', 'creator', 'creator'), ('page', 'organization', 'organization'), ('page', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'creator', 'page', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'page' AND v_filter_relation IN ('creator'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for page.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_page_organization_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'page' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('organization', 'member', 'member'), ('page', 'can_edit', 'can_edit'), ('page', 'can_edit', 'creator'), ('page', 'can_read', 'can_read'), ('page', 'can_read', 'creator'), ('page', 'creator', 'creator'), ('page', 'organization', 'organization'), ('page', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'organization', 'page', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'page' AND v_filter_relation IN ('organization'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('organization') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for page.shared_channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_page_shared_channel_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'page' AND t.relation IN ('shared_channel') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('page', 'can_edit', 'can_edit'), ('page', 'can_edit', 'creator'), ('page', 'can_read', 'can_read'), ('page', 'can_read', 'creator'), ('page', 'creator', 'creator'), ('page', 'organization', 'organization'), ('page', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'shared_channel', 'page', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'page' AND v_filter_relation IN ('shared_channel'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('channel') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('shared_channel') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for task.channel
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_task_channel_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'task' AND t.relation IN ('channel') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('task', 'can_read', 'can_read'), ('task', 'can_write', 'can_write'), ('task', 'channel', 'channel'), ('task', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'channel', 'task', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'task' AND v_filter_relation IN ('channel'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('channel') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'task' AND t.relation IN ('channel') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for task.organization
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_task_organization_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'task' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('organization', 'member', 'member'), ('task', 'can_read', 'can_read'), ('task', 'can_write', 'can_write'), ('task', 'channel', 'channel'), ('task', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'organization', 'task', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'task' AND v_filter_relation IN ('organization'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('organization') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'task' AND t.relation IN ('organization') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for channel.can_post
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_channel_can_post_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'channel' AND t.relation IN ('can_post', 'member') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_post', 'channel', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'channel' AND v_filter_relation IN ('can_post', 'member'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('can_post', 'member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for channel.can_read
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_channel_can_read_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'channel' AND t.relation IN ('can_read', 'member') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_read', 'channel', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'channel' AND v_filter_relation IN ('can_read', 'member'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'channel' AND t.relation IN ('can_read', 'member') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for task.can_read
-- Features: Recursive
-- Indirect anchor: channel.member via ttu
CREATE OR REPLACE FUNCTION "authz"."list_task_can_read_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_is_userset_filter BOOLEAN;
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    v_is_userset_filter := position('#' in p_subject_type) > 0;
    IF v_is_userset_filter THEN
        v_filter_type := split_part(p_subject_type, '#', 1);
        v_filter_relation := split_part(p_subject_type, '#', 2);
        -- Self-candidate: when filter type matches object type
        IF v_filter_type = 'task' THEN
        IF EXISTS (
    		SELECT p_object_id || '#' || v_filter_relation AS subject_id
    		WHERE (v_filter_type = 'task' AND EXISTS (
    SELECT 1
    FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('task', 'can_read', 'can_read'), ('task', 'can_write', 'can_write'), ('task', 'channel', 'channel'), ('task', 'organization', 'organization')) AS c(object_type, relation, satisfying_relation)
    WHERE (c.object_type = 'task' AND c.relation = 'can_read' AND c.satisfying_relation = v_filter_relation)
    ))
    ) THEN
        RETURN QUERY
        WITH base_results AS (
            SELECT p_object_id || '#' || v_filter_relation AS subject_id
            		WHERE (v_filter_type = 'task' AND EXISTS (
            SELECT 1
            FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('task', 'can_read', 'can_read'), ('task', 'can_write', 'can_write'), ('task', 'channel', 'channel'), ('task', 'organization', 'organization')) AS c(object_type, relation, satisfying_relation)
            WHERE (c.object_type = 'task' AND c.relation = 'can_read' AND c.satisfying_relation = v_filter_relation)
            ))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
        RETURN;
    END IF;
    END IF;
        -- Userset filter case
        RETURN QUERY
        WITH base_results AS (
            WITH subject_candidates AS (
                -- From channel parents
                    SELECT DISTINCT s.subject_id
                    FROM melange_tuples AS link
                    CROSS JOIN LATERAL "authz"."list_channel_member_sub"(link.subject_id, p_subject_type) AS s
                    WHERE (link.object_type = 'task' AND link.object_id = p_object_id AND link.relation = 'channel' AND link.subject_type = 'channel')
            )
            SELECT DISTINCT sc.subject_id
            FROM subject_candidates AS sc
            WHERE "authz"."check_permission_internal"(v_filter_type, sc.subject_id, 'can_read', 'task', p_object_id, ARRAY[]::TEXT[]) = 1
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Direct subject type case
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        RETURN QUERY
        WITH base_results AS (
            WITH subject_candidates AS (
                -- From channel parents
                    SELECT DISTINCT s.subject_id
                    FROM melange_tuples AS link
                    CROSS JOIN LATERAL "authz"."list_channel_member_sub"(link.subject_id, p_subject_type) AS s
                    WHERE (link.object_type = 'task' AND link.object_id = p_object_id AND link.relation = 'channel' AND link.subject_type = 'channel')
            )
            SELECT DISTINCT sc.subject_id
            FROM subject_candidates AS sc
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for task.can_write
-- Features: Recursive
-- Indirect anchor: channel.member via ttu
CREATE OR REPLACE FUNCTION "authz"."list_task_can_write_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_is_userset_filter BOOLEAN;
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    v_is_userset_filter := position('#' in p_subject_type) > 0;
    IF v_is_userset_filter THEN
        v_filter_type := split_part(p_subject_type, '#', 1);
        v_filter_relation := split_part(p_subject_type, '#', 2);
        -- Self-candidate: when filter type matches object type
        IF v_filter_type = 'task' THEN
        IF EXISTS (
    		SELECT p_object_id || '#' || v_filter_relation AS subject_id
    		WHERE (v_filter_type = 'task' AND EXISTS (
    SELECT 1
    FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('task', 'can_read', 'can_read'), ('task', 'can_write', 'can_write'), ('task', 'channel', 'channel'), ('task', 'organization', 'organization')) AS c(object_type, relation, satisfying_relation)
    WHERE (c.object_type = 'task' AND c.relation = 'can_write' AND c.satisfying_relation = v_filter_relation)
    ))
    ) THEN
        RETURN QUERY
        WITH base_results AS (
            SELECT p_object_id || '#' || v_filter_relation AS subject_id
            		WHERE (v_filter_type = 'task' AND EXISTS (
            SELECT 1
            FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('task', 'can_read', 'can_read'), ('task', 'can_write', 'can_write'), ('task', 'channel', 'channel'), ('task', 'organization', 'organization')) AS c(object_type, relation, satisfying_relation)
            WHERE (c.object_type = 'task' AND c.relation = 'can_write' AND c.satisfying_relation = v_filter_relation)
            ))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
        RETURN;
    END IF;
    END IF;
        -- Userset filter case
        RETURN QUERY
        WITH base_results AS (
            WITH subject_candidates AS (
                -- From channel parents
                    SELECT DISTINCT s.subject_id
                    FROM melange_tuples AS link
                    CROSS JOIN LATERAL "authz"."list_channel_member_sub"(link.subject_id, p_subject_type) AS s
                    WHERE (link.object_type = 'task' AND link.object_id = p_object_id AND link.relation = 'channel' AND link.subject_type = 'channel')
            )
            SELECT DISTINCT sc.subject_id
            FROM subject_candidates AS sc
            WHERE "authz"."check_permission_internal"(v_filter_type, sc.subject_id, 'can_write', 'task', p_object_id, ARRAY[]::TEXT[]) = 1
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Direct subject type case
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        RETURN QUERY
        WITH base_results AS (
            WITH subject_candidates AS (
                -- From channel parents
                    SELECT DISTINCT s.subject_id
                    FROM melange_tuples AS link
                    CROSS JOIN LATERAL "authz"."list_channel_member_sub"(link.subject_id, p_subject_type) AS s
                    WHERE (link.object_type = 'task' AND link.object_id = p_object_id AND link.relation = 'channel' AND link.subject_type = 'channel')
            )
            SELECT DISTINCT sc.subject_id
            FROM subject_candidates AS sc
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for cloud_workspace.can_operate
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_can_operate_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'creator') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'creator'), ('cloud_workspace', 'can_read', 'can_read'), ('cloud_workspace', 'can_read', 'creator'), ('cloud_workspace', 'creator', 'creator'), ('cloud_workspace', 'environment', 'environment'), ('cloud_workspace', 'organization', 'organization'), ('cloud_workspace', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_operate', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('can_operate', 'creator'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for cloud_workspace.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_can_read_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if p_subject_type is a userset filter (contains '#')
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH closure(object_type, relation, satisfying_relation) AS (
            VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'creator'), ('cloud_workspace', 'can_read', 'can_read'), ('cloud_workspace', 'can_read', 'creator'), ('cloud_workspace', 'creator', 'creator'), ('cloud_workspace', 'environment', 'environment'), ('cloud_workspace', 'organization', 'organization'), ('cloud_workspace', 'shared_channel', 'shared_channel')
        ),
        base_results AS (
            -- Direct userset tuples
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'cloud_workspace' AND t.object_id = p_object_id AND t.relation IN ('can_read', 'creator') AND position('#' in t.subject_id) > 0 AND t.subject_type = v_filter_type AND EXISTS (
                SELECT 1
                FROM closure AS c
                WHERE (c.object_type = v_filter_type AND c.relation = split_part(t.subject_id, '#', 2) AND c.satisfying_relation = v_filter_relation)
                ) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_read', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- TTU userset: shared_channel -> member
                SELECT split_part(pt.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS link
                		INNER JOIN melange_tuples AS pt ON (pt.object_type = link.subject_type AND pt.object_id = link.subject_id AND pt.relation IN (SELECT c.satisfying_relation
                FROM closure AS c
                WHERE (c.object_type = link.subject_type AND c.relation = 'member')))
                		WHERE (link.object_type = 'cloud_workspace' AND link.object_id = p_object_id AND link.relation = 'shared_channel' AND pt.subject_type = v_filter_type AND position('#' in pt.subject_id) > 0 AND (split_part(pt.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM closure AS subj_c
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(pt.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND link.subject_type IN ('channel'))
                UNION
                -- TTU intermediate: parent object as userset reference
                SELECT link.subject_id || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS link
                		WHERE (link.object_type = 'cloud_workspace' AND link.object_id = p_object_id AND link.relation = 'shared_channel' AND link.subject_type = v_filter_type AND EXISTS (
                SELECT 1
                FROM closure AS c
                WHERE (c.object_type = link.subject_type AND c.relation = 'member' AND c.satisfying_relation = v_filter_relation)
                ) AND link.subject_type IN ('channel'))
                UNION
                -- TTU nested: multi-hop chain resolution
                SELECT nested.subject_id
                FROM melange_tuples AS link
                CROSS JOIN LATERAL "authz"."list_accessible_subjects"(link.subject_type, link.subject_id, 'member', p_subject_type) AS nested
                WHERE (link.object_type = 'cloud_workspace' AND link.object_id = p_object_id AND link.relation = 'shared_channel' AND link.subject_type IN ('channel'))
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('can_read', 'creator'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Regular subject type: find direct subjects and expand usersets
        RETURN QUERY
        WITH base_results AS (
            WITH RECURSIVE parent_closure AS (
                SELECT link.subject_type, link.subject_id, 0 AS depth
                FROM melange_tuples AS link
                WHERE (link.object_type = 'cloud_workspace' AND link.object_id = p_object_id AND link.relation IN ('shared_channel') AND link.subject_type IN ('channel'))
                        UNION
                        SELECT link.subject_type, link.subject_id, p.depth + 1 AS depth
                FROM parent_closure AS p
                INNER JOIN melange_tuples AS link ON (link.object_type = p.subject_type AND link.object_id = p.subject_id)
                WHERE (p.subject_type = 'cloud_workspace' AND link.relation IN ('shared_channel') AND p.depth < 25)
            ),
            base_results AS (
                -- Direct tuple lookup with simple closure relations
                    SELECT DISTINCT t.subject_id
                    FROM melange_tuples AS t
                    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_read', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
                    UNION
                    -- TTU: subjects via shared_channel -> member (parent closure optimization)
                    SELECT DISTINCT t.subject_id
                    FROM parent_closure AS p
                    INNER JOIN melange_tuples AS t ON (t.object_type = p.subject_type AND t.object_id = p.subject_id)
                    WHERE (t.subject_type = p_subject_type AND t.relation IN ('member') AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
            )
            SELECT br.subject_id
            FROM base_results AS br
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for environment.can_create_workspace
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_environment_can_create_workspace_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'environment' AND t.relation IN ('can_create_workspace', 'runner') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('environment', 'can_create_workspace', 'can_create_workspace'), ('environment', 'can_create_workspace', 'runner'), ('environment', 'organization', 'organization'), ('environment', 'runner', 'runner')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_create_workspace', 'environment', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'environment' AND v_filter_relation IN ('can_create_workspace', 'runner'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'environment' AND t.relation IN ('can_create_workspace', 'runner') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for page.can_edit
-- Features: Implied
CREATE OR REPLACE FUNCTION "authz"."list_page_can_edit_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if subject_type is a userset filter (e.g., "document#viewer")
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH base_results AS (
            -- Userset filter: find userset tuples that match and return normalized references
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'page' AND t.relation IN ('can_edit', 'creator') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('page', 'can_edit', 'can_edit'), ('page', 'can_edit', 'creator'), ('page', 'can_read', 'can_read'), ('page', 'can_read', 'creator'), ('page', 'creator', 'creator'), ('page', 'organization', 'organization'), ('page', 'shared_channel', 'shared_channel')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_edit', 'page', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'page' AND v_filter_relation IN ('can_edit', 'creator'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Guard: return empty if subject type is not allowed by the model
        IF p_subject_type NOT IN ('user', 'agent') THEN
        RETURN;
    END IF;
        -- Regular subject type (no userset filter)
        RETURN QUERY
        WITH base_results AS (
            -- Path 1: Direct tuple lookup with simple closure relations
                SELECT DISTINCT t.subject_id
                FROM melange_tuples AS t
                WHERE (t.object_type = 'page' AND t.relation IN ('can_edit', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- Generated list_subjects function for page.can_read
-- Features: Implied+Recursive
CREATE OR REPLACE FUNCTION "authz"."list_page_can_read_sub"(
    p_object_id TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE(subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
DECLARE
    v_filter_type TEXT;
    v_filter_relation TEXT;
BEGIN
    -- Check if p_subject_type is a userset filter (contains '#')
    IF position('#' in p_subject_type) > 0 THEN
        v_filter_type := substring(p_subject_type from 1 for position('#' in p_subject_type) - 1);
        v_filter_relation := substring(p_subject_type from position('#' in p_subject_type) + 1);
        RETURN QUERY
        WITH closure(object_type, relation, satisfying_relation) AS (
            VALUES ('agent', 'organization', 'organization'), ('agent', 'owner', 'owner'), ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization'), ('page', 'can_edit', 'can_edit'), ('page', 'can_edit', 'creator'), ('page', 'can_read', 'can_read'), ('page', 'can_read', 'creator'), ('page', 'creator', 'creator'), ('page', 'organization', 'organization'), ('page', 'shared_channel', 'shared_channel')
        ),
        base_results AS (
            -- Direct userset tuples
                SELECT split_part(t.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS t
                		WHERE (t.object_type = 'page' AND t.object_id = p_object_id AND t.relation IN ('can_read', 'creator') AND position('#' in t.subject_id) > 0 AND t.subject_type = v_filter_type AND EXISTS (
                SELECT 1
                FROM closure AS c
                WHERE (c.object_type = v_filter_type AND c.relation = split_part(t.subject_id, '#', 2) AND c.satisfying_relation = v_filter_relation)
                ) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_read', 'page', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- TTU userset: shared_channel -> member
                SELECT split_part(pt.subject_id, '#', 1) || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS link
                		INNER JOIN melange_tuples AS pt ON (pt.object_type = link.subject_type AND pt.object_id = link.subject_id AND pt.relation IN (SELECT c.satisfying_relation
                FROM closure AS c
                WHERE (c.object_type = link.subject_type AND c.relation = 'member')))
                		WHERE (link.object_type = 'page' AND link.object_id = p_object_id AND link.relation = 'shared_channel' AND pt.subject_type = v_filter_type AND position('#' in pt.subject_id) > 0 AND (split_part(pt.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM closure AS subj_c
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(pt.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND link.subject_type IN ('channel'))
                UNION
                -- TTU intermediate: parent object as userset reference
                SELECT link.subject_id || '#' || v_filter_relation AS subject_id
                		FROM melange_tuples AS link
                		WHERE (link.object_type = 'page' AND link.object_id = p_object_id AND link.relation = 'shared_channel' AND link.subject_type = v_filter_type AND EXISTS (
                SELECT 1
                FROM closure AS c
                WHERE (c.object_type = link.subject_type AND c.relation = 'member' AND c.satisfying_relation = v_filter_relation)
                ) AND link.subject_type IN ('channel'))
                UNION
                -- TTU nested: multi-hop chain resolution
                SELECT nested.subject_id
                FROM melange_tuples AS link
                CROSS JOIN LATERAL "authz"."list_accessible_subjects"(link.subject_type, link.subject_id, 'member', p_subject_type) AS nested
                WHERE (link.object_type = 'page' AND link.object_id = p_object_id AND link.relation = 'shared_channel' AND link.subject_type IN ('channel'))
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'page' AND v_filter_relation IN ('can_read', 'creator'))
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    ELSE
        -- Regular subject type: find direct subjects and expand usersets
        RETURN QUERY
        WITH base_results AS (
            WITH RECURSIVE parent_closure AS (
                SELECT link.subject_type, link.subject_id, 0 AS depth
                FROM melange_tuples AS link
                WHERE (link.object_type = 'page' AND link.object_id = p_object_id AND link.relation IN ('shared_channel') AND link.subject_type IN ('channel'))
                        UNION
                        SELECT link.subject_type, link.subject_id, p.depth + 1 AS depth
                FROM parent_closure AS p
                INNER JOIN melange_tuples AS link ON (link.object_type = p.subject_type AND link.object_id = p.subject_id)
                WHERE (p.subject_type = 'page' AND link.relation IN ('shared_channel') AND p.depth < 25)
            ),
            base_results AS (
                -- Direct tuple lookup with simple closure relations
                    SELECT DISTINCT t.subject_id
                    FROM melange_tuples AS t
                    WHERE (t.object_type = 'page' AND t.relation IN ('can_read', 'creator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
                    UNION
                    -- TTU: subjects via shared_channel -> member (parent closure optimization)
                    SELECT DISTINCT t.subject_id
                    FROM parent_closure AS p
                    INNER JOIN melange_tuples AS t ON (t.object_type = p.subject_type AND t.object_id = p.subject_id)
                    WHERE (t.subject_type = p_subject_type AND t.relation IN ('member') AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
            )
            SELECT br.subject_id
            FROM base_results AS br
        ),
        paged AS (
            SELECT br.subject_id
            FROM base_results br
            WHERE p_after IS NULL OR (
                -- Compound comparison for wildcard-first ordering:
                -- (is_not_wildcard, subject_id) > (cursor_is_not_wildcard, cursor)
                (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END, br.subject_id) >
                (CASE WHEN p_after = '*' THEN 0 ELSE 1 END, p_after)
            )
            ORDER BY (CASE WHEN br.subject_id = '*' THEN 0 ELSE 1 END), br.subject_id
            LIMIT CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit + 1 END
        ),
        returned AS (
            SELECT p.subject_id FROM paged p
            ORDER BY (CASE WHEN p.subject_id = '*' THEN 0 ELSE 1 END), p.subject_id
            LIMIT p_limit
        ),
        next AS (
            SELECT CASE
                WHEN p_limit IS NOT NULL AND (SELECT count(*) FROM paged) > p_limit
                THEN (SELECT r.subject_id FROM returned r
                      ORDER BY (CASE WHEN r.subject_id = '*' THEN 0 ELSE 1 END) DESC, r.subject_id DESC
                      LIMIT 1)
            END AS next_cursor
        )
        SELECT r.subject_id, n.next_cursor
        FROM returned r
        CROSS JOIN next n;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';

-- ============================================================
-- List Dispatchers
-- ============================================================

-- Generated dispatcher for list_accessible_objects
-- Routes to specialized functions for all type/relation pairs
CREATE OR REPLACE FUNCTION "authz"."list_accessible_objects"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_relation TEXT,
    p_object_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE (object_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    -- Route to specialized functions, nested by object type then relation
    IF p_object_type = 'agent' THEN
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_agent_organization_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'owner' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_agent_owner_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'channel' THEN
        IF p_relation = 'member' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_member_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_organization_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_post' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_can_post_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_can_read_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'cloud_workspace' THEN
        IF p_relation = 'creator' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_creator_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'environment' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_environment_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_organization_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_shared_channel_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_can_operate_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_can_read_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'environment' THEN
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_environment_organization_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'runner' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_environment_runner_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_create_workspace' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_environment_can_create_workspace_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_organization_member_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'page' THEN
        IF p_relation = 'creator' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_creator_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_organization_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_shared_channel_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_edit' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_can_edit_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_can_read_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'task' THEN
        IF p_relation = 'channel' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_channel_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_organization_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_can_read_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_write' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_can_write_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    -- Unknown type/relation pair - return empty result (relation not defined in model)
    -- This matches check_permission behavior for unknown relations (returns 0/denied)
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;

-- Generated dispatcher for list_accessible_subjects
-- Routes to specialized functions for all type/relation pairs
CREATE OR REPLACE FUNCTION "authz"."list_accessible_subjects"(
    p_object_type TEXT,
    p_object_id TEXT,
    p_relation TEXT,
    p_subject_type TEXT,
    p_limit INT DEFAULT NULL,
    p_after TEXT DEFAULT NULL
) RETURNS TABLE (subject_id TEXT, next_cursor TEXT) ROWS 100 AS $$
BEGIN
    -- Route to specialized functions, nested by object type then relation
    IF p_object_type = 'agent' THEN
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_agent_organization_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'owner' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_agent_owner_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'channel' THEN
        IF p_relation = 'member' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_member_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_organization_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_post' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_can_post_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_channel_can_read_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'cloud_workspace' THEN
        IF p_relation = 'creator' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_creator_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'environment' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_environment_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_organization_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_shared_channel_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_can_operate_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_can_read_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'environment' THEN
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_environment_organization_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'runner' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_environment_runner_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_create_workspace' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_environment_can_create_workspace_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_organization_member_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'page' THEN
        IF p_relation = 'creator' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_creator_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_organization_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'shared_channel' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_shared_channel_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_edit' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_can_edit_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_page_can_read_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    IF p_object_type = 'task' THEN
        IF p_relation = 'channel' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_channel_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'organization' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_organization_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_read' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_can_read_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_write' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_task_can_write_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        RETURN;
    END IF;
    -- Unknown type/relation pair - return empty result (relation not defined in model)
    -- This matches check_permission behavior for unknown relations (returns 0/denied)
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;

-- ============================================================
-- Migration Record
-- ============================================================

INSERT INTO "authz"."melange_migrations" (melange_version, schema_checksum, codegen_version, function_names, function_checksums, schema_dsl, schema_format, model_json)
VALUES ('0.10.1', '6ce68fd0230b4aa56d322ab91bcc1c12a4aa4b7192814fae193f3ffa75800fdf', '0.10.1', ARRAY['check_agent_organization', 'check_agent_owner', 'check_channel_can_post', 'check_channel_can_read', 'check_channel_member', 'check_channel_organization', 'check_cloud_workspace_can_operate', 'check_cloud_workspace_can_read', 'check_cloud_workspace_creator', 'check_cloud_workspace_environment', 'check_cloud_workspace_organization', 'check_cloud_workspace_shared_channel', 'check_environment_can_create_workspace', 'check_environment_organization', 'check_environment_runner', 'check_organization_member', 'check_page_can_edit', 'check_page_can_read', 'check_page_creator', 'check_page_organization', 'check_page_shared_channel', 'check_permission', 'check_permission_bulk', 'check_permission_internal', 'check_permission_nw', 'check_permission_nw_internal', 'check_task_can_read', 'check_task_can_write', 'check_task_channel', 'check_task_organization', 'expand_agent_organization', 'expand_agent_owner', 'expand_channel_can_post', 'expand_channel_can_read', 'expand_channel_member', 'expand_channel_organization', 'expand_cloud_workspace_can_operate', 'expand_cloud_workspace_can_read', 'expand_cloud_workspace_creator', 'expand_cloud_workspace_environment', 'expand_cloud_workspace_organization', 'expand_cloud_workspace_shared_channel', 'expand_environment_can_create_workspace', 'expand_environment_organization', 'expand_environment_runner', 'expand_organization_member', 'expand_page_can_edit', 'expand_page_can_read', 'expand_page_creator', 'expand_page_organization', 'expand_page_shared_channel', 'expand_permission', 'expand_permission_internal', 'expand_task_can_read', 'expand_task_can_write', 'expand_task_channel', 'expand_task_organization', 'explain_agent_organization', 'explain_agent_owner', 'explain_channel_can_post', 'explain_channel_can_read', 'explain_channel_member', 'explain_channel_organization', 'explain_cloud_workspace_can_operate', 'explain_cloud_workspace_can_read', 'explain_cloud_workspace_creator', 'explain_cloud_workspace_environment', 'explain_cloud_workspace_organization', 'explain_cloud_workspace_shared_channel', 'explain_environment_can_create_workspace', 'explain_environment_organization', 'explain_environment_runner', 'explain_organization_member', 'explain_page_can_edit', 'explain_page_can_read', 'explain_page_creator', 'explain_page_organization', 'explain_page_shared_channel', 'explain_permission', 'explain_permission_internal', 'explain_task_can_read', 'explain_task_can_write', 'explain_task_channel', 'explain_task_organization', 'list_accessible_objects', 'list_accessible_subjects', 'list_agent_organization_obj', 'list_agent_organization_sub', 'list_agent_owner_obj', 'list_agent_owner_sub', 'list_channel_can_post_obj', 'list_channel_can_post_sub', 'list_channel_can_read_obj', 'list_channel_can_read_sub', 'list_channel_member_obj', 'list_channel_member_sub', 'list_channel_organization_obj', 'list_channel_organization_sub', 'list_cloud_workspace_can_operate_obj', 'list_cloud_workspace_can_operate_sub', 'list_cloud_workspace_can_read_obj', 'list_cloud_workspace_can_read_sub', 'list_cloud_workspace_creator_obj', 'list_cloud_workspace_creator_sub', 'list_cloud_workspace_environment_obj', 'list_cloud_workspace_environment_sub', 'list_cloud_workspace_organization_obj', 'list_cloud_workspace_organization_sub', 'list_cloud_workspace_shared_channel_obj', 'list_cloud_workspace_shared_channel_sub', 'list_environment_can_create_workspace_obj', 'list_environment_can_create_workspace_sub', 'list_environment_organization_obj', 'list_environment_organization_sub', 'list_environment_runner_obj', 'list_environment_runner_sub', 'list_organization_member_obj', 'list_organization_member_sub', 'list_page_can_edit_obj', 'list_page_can_edit_sub', 'list_page_can_read_obj', 'list_page_can_read_sub', 'list_page_creator_obj', 'list_page_creator_sub', 'list_page_organization_obj', 'list_page_organization_sub', 'list_page_shared_channel_obj', 'list_page_shared_channel_sub', 'list_task_can_read_obj', 'list_task_can_read_sub', 'list_task_can_write_obj', 'list_task_can_write_sub', 'list_task_channel_obj', 'list_task_channel_sub', 'list_task_organization_obj', 'list_task_organization_sub'], '{"check_agent_organization":"1dce429d46ccbedebb279f950cb3126aa4e1a2e41489d2b6baba0d5b454cc5b0","check_agent_owner":"2348ade8a2e68be9d62de0ea2a7f2c28f5012ee27f5df88fbc8a2e3aced00465","check_channel_can_post":"8062dd7e3756493fc1991005122040152f672df8fd7e2efc222d18cb65a1a048","check_channel_can_read":"dd8c2cbb33781b08a2ee4de703555f2e70b8687fc996d677d1e649cabac52185","check_channel_member":"30f94fed9057504430235389e46f1d594e0511cf8351684fdbf7b56e3b326ebe","check_channel_organization":"8552d02e9179552fbf3306f4d60814b62e26838ef31e9892fdae211f237aba25","check_cloud_workspace_can_operate":"cb7c3a3ef1e3ab8150883a946192c5b5ba3fe25c0747e473f61f1d089f1bdf3b","check_cloud_workspace_can_read":"8efc7339e4ca05fb679a6858c6ad007bb9c14d3fe79f7c3264be39206c4f31e5","check_cloud_workspace_creator":"7b6e1f7379320505f0e699fcf2fd7a244a12eb75042b56203f43371578499f0b","check_cloud_workspace_environment":"138ad20d1d4e3cd11e32371acb05715105b57341ca59d9164afc9e72522e841f","check_cloud_workspace_organization":"9e337e4c6478facfc41a6aab974b4637e437c227b22fd0a5486b79ff1e805691","check_cloud_workspace_shared_channel":"9ac1c5eba273c5ca19e87f2121426b0a5b58ea3e0bd886eefa180d8ab985245a","check_environment_can_create_workspace":"d23c7fc76c6e9cd777d11beea7ae0da2e911c5ec5697978bbccca99f0f89564d","check_environment_organization":"257616fd288c37f47161cbe3f9268afca1f6bdca8fc2320a0aaaf303b4283e26","check_environment_runner":"368cc101fdf4fc0e6190d2d074b04c7addaaa4379b447e5139fddf8c08e0b151","check_organization_member":"38caaad5c712e56dd7545e0473d02f541e3bc7f5e3c5010b3c761d2720ae460e","check_page_can_edit":"eb40006561cddb0acf57f49c7aa02137fedd1017b9a53fa569698dcea37fa71e","check_page_can_read":"2ec4e84662cfeead49912a1d27c460f534662a4f605de1e8366de025a1dc5fde","check_page_creator":"48d007a76fb220ed178bf7b9daa9e8f56df3a3a3b622628bbfdfd71ddd670337","check_page_organization":"ccc052f74ff538b8dd4161d82fa09c7d3363eb1d56b453bc2cd6137a6aa997c2","check_page_shared_channel":"3f69be218de17cf75597def324a661d585c1e7c6d74f77a6b67025ff21637e68","check_permission":"3764c7f6f90c40e8c8c240bdc8ff15c58a7ac855604556f8605402480d4a7a0d","check_permission_bulk":"5b5a3f8f29178c159976e98c6b6dc1c716e22c0c2f78e31f5b460756b9025a6f","check_permission_nw":"2634e6e6e44b7b6967af27042a0c7485e75dbb9a2383db5b36291b21bf1fe4f4","check_task_can_read":"93672fe67d2ecc637f0cac54c323f3790838d71b26b7b4999b8bfbc5139c0a87","check_task_can_write":"d6b6f5f50cb07a5f34fc67d59d8de0df475fb0d5998f2d76079bf392a8e37d34","check_task_channel":"7f58fa0a7462703483d5689645e530ea33d49393eb0cc04aab22a6be69c66472","check_task_organization":"9401bd427c09f58c833e97dcf469f6b15cd7a378b9e516a1900f302cf6bcda6f","expand_agent_organization":"e89bf83b57489e77f12d196d23029cce12f505b1f941acadc924ac1326c51653","expand_agent_owner":"fc9337e513ca6ad302a1c8a52c7256eb327149b855be6ea6f33b89ec85c8c1dc","expand_channel_can_post":"1aea8d02e3766bd7f3b5fe0c973b083a3bed334f0f10d60451d12e1bfe129e1d","expand_channel_can_read":"c5f75e55c4c6200a4b4991b49b4c20307186b61e89adf48ee380bad52442e766","expand_channel_member":"a84704a35b311ac10630df7cbba6a1d4282408f65e3bc6f828001fd93af28104","expand_channel_organization":"23bf14131c36605b9602dfd2bd75ae61eb9caebcd361c7f27388509a3f9a8461","expand_cloud_workspace_can_operate":"d59d61ef20b1f7dadfd222f895d17be2082eae9feba3a7c21105dc91f50b9d2a","expand_cloud_workspace_can_read":"6811ae3d1a54793f40695b81aa084004984874c6fbea53b074e6d5b831e43292","expand_cloud_workspace_creator":"396c8ba7193a4766a5661cba9f1e4f5188c22c4426e45938531577eed9f31178","expand_cloud_workspace_environment":"799ba986cc582d088e34a4ca303a744f5a0c51f83e7b54cef18dd751de1a8e88","expand_cloud_workspace_organization":"21482b6f55beba5e6475459af1e6a5e63925b57da005cd41f9425ad175a2e926","expand_cloud_workspace_shared_channel":"c8a676f7796880ec0716e9e1d95bceab501144fbe4f18bd5429e0531aea1c74d","expand_environment_can_create_workspace":"2a3c6fd46de559a21a8d4a41f794ae5e52a7960493627a353704b21ab8982457","expand_environment_organization":"ed81f1ac0a07d38df0ec5b3f20e820140b98f8b0f3b03913d0dccbc80356d235","expand_environment_runner":"555de3793d9d41e58210510df65893ddc09a98d08b5e5d78ef56aea3f8f8ee35","expand_organization_member":"53be76cec6bbae733148d2933d3d341e36678ad15fd1a0dd3b4b974aead7c9f9","expand_page_can_edit":"fc7692946b1453d8bb53cc918eb92530f2f03d758f07c1c502ceac3214bd366c","expand_page_can_read":"77015f97bae176b9d65d8d27930a8ef59693ee573c8e56064a16c83e86bab4a4","expand_page_creator":"f2e8a7eb0396d4375d231c2a10ff41540055b76b26d3a5583d03aff9f9f011b3","expand_page_organization":"6bda8fa2802d4b9142586855db5fae34d80030d32e311a7aa6f7efec3f678af1","expand_page_shared_channel":"9d1c563d1f254920c1ce3fde0c999e3355cd28d8431993357961fb013ee63758","expand_permission":"7677cc9c412aba9eb614db42784722628d5c89a91a97e90f2d944b07679e61aa","expand_task_can_read":"76172d96022af70b1cf11eacfdafc67ee884accae4fc039cf1a8d4b6f02319d7","expand_task_can_write":"250faffb2434067fc03a1e80bc4f405738e38941d0a091b20e52d55d626b1a93","expand_task_channel":"4e90f7a8847c1d6f5b5329454c072582140daf3947e51500ba71e40aca2fb2d5","expand_task_organization":"a038221a2bbc69aaac9457fa4dad2bd8d5ef0bc00d40550e3fe524adb1c46c98","explain_agent_organization":"581bfc24b1aed830b7a8ca2156354d0b3bcb69385566e878315eb7ccd2cf301d","explain_agent_owner":"6f4e0c7836167d00613fba90f20057c64f0821aeacba2d26778d244e0da37582","explain_channel_can_post":"2cd8594bc329ff09ac444bb2ab2a49c79e54c40f74818725f1842b57ff20d643","explain_channel_can_read":"a75fd832f83c4c147ddb8836ada07d5679196c8c0685a90fc9ad75a448e6a7bb","explain_channel_member":"df4e3ebcb2d41240baade18bc515496ef4f1c304dd3d8b5ad6c0456d4d24e424","explain_channel_organization":"a24ced83e234e9ccbbadf72c8fbd42b0bda9b0c5bdfe54085d22d9d1bce4ff93","explain_cloud_workspace_can_operate":"9b9542ab94cdc4cae025bf424826d8a352e8afd4a2d59be133439e060cd56688","explain_cloud_workspace_can_read":"9edb438fefc8f8bbba121660805458b6783139bc83e876f23df5c56864ecc706","explain_cloud_workspace_creator":"67a630c59480f2cb15d644d30021c769c04b6ef56715f92b5b50c959e2bd6c96","explain_cloud_workspace_environment":"ec0089dd0dd4bae95b6a3bb1b0028f7e484b7fb50a15f852eab01e5a1ffd73fd","explain_cloud_workspace_organization":"c43b90b0401ef2b2cf96bd354a175e3f6200a64d9ca4a5b2f3d42b4568afa7e8","explain_cloud_workspace_shared_channel":"660e74cf20b1d92edd5671467fd7f7bdd3fc4cea3d76e3958d12f4b904a9a39e","explain_environment_can_create_workspace":"8cb324845214fc7116bb7627e0fffec120a316cbe56b2f7d0c63e1afef81c76e","explain_environment_organization":"3ee2c3dc5a759afbe76faf48f267046a6fdb588e37de9e2d89e76ce943e61103","explain_environment_runner":"ffd28fb534725ecb20ad4261121449fc98af09b75211ba778086b9f473210ab7","explain_organization_member":"121e5fe6ec5e81fa1e0c71631a0f39e108b3118d000a52ec23a143783ea1c75d","explain_page_can_edit":"020aecc2ba0b78790244fac976b177b1dc7191df0a8c7d0fd44ef47a0435bf85","explain_page_can_read":"ea1bf99e3ffb1cb7c3a7e3797f1f15555645039fc1eb03620b78f2400a2bcfaf","explain_page_creator":"caeaf34f93b19347307541edb551cc803f6377f76e237f3be9bd31fdbc33c1df","explain_page_organization":"4aefd29e0ad887415bd60bb28665d9dafa230123434134798121cb424906a48f","explain_page_shared_channel":"d979143c5b11e74cb85019d0a7fd289a457b203fba86ee594efcbee028a2f05f","explain_permission":"c790745af752fdbf34be694343d495f11cdfa6be2628292646e8aecb3fb56cb5","explain_task_can_read":"a6734574ceda27ce188989ce47653bf018c27c7fc0c8585aba1dcbe8d86d44c2","explain_task_can_write":"2d9e915b6809ffb1696221691dce4f1e580306b2aa4b57b9614ac21fe54d5e88","explain_task_channel":"61ac440658268005e17f5e62e5773f41873edf7808c1171b09ac8f958d222049","explain_task_organization":"ad1a42ec11de05cf9da6cebebe5c6f9ed70abbce7783650819267282df3180f4","list_accessible_objects":"8ed2486c4ecf5d350d7e409d477589fc1c17470fd3fcd431e98634a24f5bb6bf","list_accessible_subjects":"f660e2a51e607dfffadd045892f3b650365e9e9bb8e23f913e043f6eb9bd1373","list_agent_organization_obj":"0598e98923ad467177024306db8cab6b2410dcbf5d3fe315bad45b440095f525","list_agent_organization_sub":"097760d0e2e3efee5a3abe7e087e7ae7d83577e97339773f951e4526714caf4a","list_agent_owner_obj":"285a14d3fb159153cc9574d2b2a8948c5c1d920e3fe68edeba094b35e1d19fca","list_agent_owner_sub":"ab97c33537f0a0ded39733107d39c101e55d7f499840439d1666b3e011925d0d","list_channel_can_post_obj":"db26ebe9087a6eb2150f0c41e49b25d050a168722f32fb22a99abfc7dbd44b8b","list_channel_can_post_sub":"26184d1bb32799b4aec6bb284417a82c8bce6452c3ffb2e8c598979b6a1277dc","list_channel_can_read_obj":"ae7d7eb1bbaa6b1520d19e1770147e939177766ae1f0cbc3af62d1bb800a5e1e","list_channel_can_read_sub":"02b82051fb36d3051eb81026eeab6618e90dbf94a4f341d9861f1471ad416fa2","list_channel_member_obj":"4590b5795a6c87b639fa71f26eb6419899811f51e477b4b480c60a45a8aca1ff","list_channel_member_sub":"1cd7b6f314c42e9ae56840ed5fbb5daaeffd91f44e06e6966e59995805310395","list_channel_organization_obj":"50ac0778a496208e8f941dfb9f95e69403066e7082ff43036a02b414f5255259","list_channel_organization_sub":"2b0f42e86cd8d1c260e0f2cadd7d728febc6043fe73656c0e409ddf56b0b2bf8","list_cloud_workspace_can_operate_obj":"706ac4b186fc46e0edbf53616d2921385ee2f6cf9e51fe23123a83c71a02b21f","list_cloud_workspace_can_operate_sub":"b068713f5bc91afcf75518e99c3b042359d0bd5b15c666d47b1293853cf891ec","list_cloud_workspace_can_read_obj":"f1cd4d50212c8d73e085a7928d04926e84ce32664e0eb1e13e546293ed7461ff","list_cloud_workspace_can_read_sub":"6e8d0203ca498005738aab1927f5eed2f07af7601c9f9f0bfc131d8b6f40e484","list_cloud_workspace_creator_obj":"7f8397a4393a4f901aab7686b98ef52484f2cf116a93a80730bc294f53d8b6b5","list_cloud_workspace_creator_sub":"0bbdeb4f7e8b5fc597acad830d2f82c04f51ddc755385977031779476e2f5041","list_cloud_workspace_environment_obj":"ff8851cec2487f6eac991fb130d331b4b3d364be51157b8324d57b299f5871b7","list_cloud_workspace_environment_sub":"5f9dec08be62f44a89bd116599c91f6820787a26be36eb5a4f065e800db8009e","list_cloud_workspace_organization_obj":"35738a43ee85a429e337031760f25875a5b69ae09db83476c4a425a533937b6e","list_cloud_workspace_organization_sub":"52637deb6d5908f73dd731e347d275328dfe7bb17765c676cbe505246283cdd6","list_cloud_workspace_shared_channel_obj":"95503ad19a2720ed508946b78347f4657de57139bb34f14705f0dd4554c792e0","list_cloud_workspace_shared_channel_sub":"06c63aa171c874d4e0cea2497a196851a93b18f8174f5139930a4f1a82350b8c","list_environment_can_create_workspace_obj":"958e94985b137bed7d743447421c175194ad37fc3860a1cdb60f84792f9a63a5","list_environment_can_create_workspace_sub":"da0a2ab21d5e4a8269fe11b334d8e811d9198058203ed603ee7c48102fb10bad","list_environment_organization_obj":"53e2ca5008f0bca513bc1a194a98f0ca77ae4da08d2db56aee1ef5f6ba65b074","list_environment_organization_sub":"e31c15bb2fa70903cc8e10a75044f3f39f6365cb572caddef16cca1f035fcd4a","list_environment_runner_obj":"87d06504a92ba80649629094a9de8ecd4a4e3157f82e6e0903c985870ed49e0a","list_environment_runner_sub":"e3d69740a6672a2f9c6ad0728174375faa95c123bcf2dc752df7ba57641a4bca","list_organization_member_obj":"6ab121db9e8eed5dd123b9efd7ea9ed6e8359d36fee0c70a5fff98bd0c6d6124","list_organization_member_sub":"6915a2f8cabdca1afadbada521d518b472b90cd88256db1ce0b7a232a42e49e9","list_page_can_edit_obj":"b0a9d03e3c127c369fadca62683dba9f299d5f4817b12404975c8081749b047c","list_page_can_edit_sub":"0772755f7f917a7e08bb867e52222b233d2b69c91b64a15ba41a104a69f38a89","list_page_can_read_obj":"ff2b1722030a0180a6a09c06c987883ac514eb0a846d5c7c6a0c0e935b4b44cc","list_page_can_read_sub":"ea07f6fdd27b59c0cd5ab884cd1da6a4b0a1f0419ad6754f1774aee1f65a7363","list_page_creator_obj":"e740c5fe853ab342f2f668c6a1b543c0f757887627f00ffffd510b77fd5e257b","list_page_creator_sub":"8ffce03f21c9c2a670348864cfeb18aaedf86d6ecbada6fde2167bc4b11c4664","list_page_organization_obj":"e8ac05798e23585aa6fb9579efb98cc3be1aa34423597ace8ee4a05bf7f9c83d","list_page_organization_sub":"3c11a862235239697e4b110252fb26480cd3350b1de981c9f46f9ac65498249c","list_page_shared_channel_obj":"dae65e16a73c87ed897a94e62531241e2950404d4478810521096d57c76f0f05","list_page_shared_channel_sub":"55d89b56b5f0ed2c6ce974712ae83d3e9f4b7c9de3ac936a94b5ea18dcbb8375","list_task_can_read_obj":"bbd8d436a9cf0c3e383d535836e85cb66fb6c09ad3b7749fd7672f30f8f694bf","list_task_can_read_sub":"93945d2243f054c417937633ea53ef8fa9c27a7bb3b5b66f9e8b72e841ffaa2d","list_task_can_write_obj":"d4c39f273d2118e2df9bb4eb0333114173c9294cec11164a72393325e5ec7405","list_task_can_write_sub":"ce63eae184a60a66608ae8cd12adce67ed9028a5639935134b4aa520cf96b575","list_task_channel_obj":"59f231f0130e967cd4866bd5e8ab5cb94976fad3840126b6f31d5aa185001c1b","list_task_channel_sub":"5880277191fcb4dd90ce78b4ccb3f7530a8e7048ca9b3d32901bcd4cd1c1784b","list_task_organization_obj":"2d8762139a6ba87fc7471f8fec69c72adcb343af0d4a2c48499aa902586ecf83","list_task_organization_sub":"297c9b726b5c2b8d98a22a608b54e05033aa4cb80f7b40fdf3a234e406627068"}', 'model
  schema 1.1

type user

type agent
  relations
    define organization: [organization]
    define owner: [user]

type organization
  relations
    define member: [user, agent]

type channel
  relations
    define organization: [organization]
    define member: [user, agent]
    define can_read: member
    define can_post: member

type task
  relations
    define organization: [organization]
    define channel: [channel]
    define can_read: member from channel
    define can_write: member from channel

type environment
  relations
    define organization: [organization]
    define runner: [agent]
    define can_create_workspace: runner

type cloud_workspace
  relations
    define organization: [organization]
    define environment: [environment]
    define creator: [user, agent]
    define shared_channel: [channel]
    define can_read: creator or member from shared_channel
    define can_operate: creator

type page
  relations
    define organization: [organization]
    define creator: [user, agent]
    define shared_channel: [channel]
    define can_read: creator or member from shared_channel
    define can_edit: creator
', 'single', '[{"Name":"user","Relations":null},{"Name":"agent","Relations":[{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"owner","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"organization","Relations":[{"Name":"member","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false},{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"channel","Relations":[{"Name":"can_post","ImpliedBy":["member"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"can_read","ImpliedBy":["member"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"member","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false},{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"task","Relations":[{"Name":"can_read","ImpliedBy":null,"ParentRelations":[{"Relation":"member","LinkingRelation":"channel"}],"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"can_write","ImpliedBy":null,"ParentRelations":[{"Relation":"member","LinkingRelation":"channel"}],"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"channel","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"channel","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"environment","Relations":[{"Name":"can_create_workspace","ImpliedBy":["runner"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"runner","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"cloud_workspace","Relations":[{"Name":"can_operate","ImpliedBy":["creator"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"can_read","ImpliedBy":["creator"],"ParentRelations":[{"Relation":"member","LinkingRelation":"shared_channel"}],"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"creator","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false},{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"environment","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"environment","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"shared_channel","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"channel","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"page","Relations":[{"Name":"can_edit","ImpliedBy":["creator"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"can_read","ImpliedBy":["creator"],"ParentRelations":[{"Relation":"member","LinkingRelation":"shared_channel"}],"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"creator","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false},{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"shared_channel","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"channel","Relation":"","Wildcard":false}],"IntersectionGroups":null}]}]');
