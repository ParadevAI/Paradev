-- Custom SQL migration file, put your code below! --
-- Melange Migration (dry-run)
-- Melange version: 0.10.1
-- Schema checksum: 143732f19f68bd2715dacd404b293c42673aee6154d04a7e67b7cd75278e5d0f
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
-- Check Functions (7 functions)
-- ============================================================

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


-- Generated check function for cloud_workspace.operator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."check_cloud_workspace_operator"(
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
    WHERE split_part(p_subject_id, '#', 2) IN ('operator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('operator') AND object_id = p_object_id AND subject_type IN ('agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
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
    WHERE split_part(p_subject_id, '#', 2) IN ('can_operate', 'operator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        RETURN 1;
    END IF;
    END IF;
    END IF;
    IF EXISTS (
    SELECT 1
    FROM melange_tuples
    WHERE (object_type = 'cloud_workspace' AND relation IN ('can_operate', 'operator') AND object_id = p_object_id AND subject_type IN ('agent') AND subject_type = p_subject_type AND (subject_id = p_subject_id AND NOT (subject_id = '*')))
    ) THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
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
        IF p_relation = 'operator' THEN
        RETURN "authz"."check_cloud_workspace_operator"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."check_cloud_workspace_can_operate"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."check_organization_member"(p_subject_type, p_subject_id, p_object_id, p_visited);
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
        IF p_relation = 'operator' THEN
        RETURN "authz"."check_cloud_workspace_operator"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."check_cloud_workspace_can_operate"(p_subject_type, p_subject_id, p_object_id, p_visited);
    END IF;
        RETURN 0;
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."check_organization_member"(p_subject_type, p_subject_id, p_object_id, p_visited);
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
-- Routes 7 (object_type, relation) pairs across 3 object types
-- Uses separate IF blocks to execute only branches for object types present in the batch
CREATE OR REPLACE FUNCTION "authz"."check_permission_bulk"(
    p_subject_types TEXT[],
    p_subject_ids TEXT[],
    p_relations TEXT[],
    p_object_types TEXT[],
    p_object_ids TEXT[]
) RETURNS TABLE(idx INTEGER, allowed INTEGER) AS $$
BEGIN
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
            WHEN (r.subject_type = 'cloud_workspace' AND position('#' in r.subject_id) > 0 AND split_part(r.subject_id, '#', 1) = r.object_id AND split_part(r.subject_id, '#', 2) IN ('operator')) THEN 1
            WHEN EXISTS (
    SELECT 1
    FROM melange_tuples AS t
    WHERE (t.subject_type = r.subject_type AND t.subject_id = r.subject_id AND t.relation = 'operator' AND t.object_type = 'cloud_workspace' AND t.object_id = r.object_id AND r.subject_type IN ('agent'))
    ) THEN 1
            ELSE 0
        END
    		FROM requests AS r
    		WHERE r.relation = 'operator'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, "authz"."check_cloud_workspace_can_operate"(r.subject_type, r.subject_id, r.object_id, ARRAY[]::TEXT[])
    FROM requests AS r
    WHERE r.relation = 'can_operate'
    
    UNION ALL
    
    SELECT r.idx::INTEGER, 0
    FROM requests AS r
    WHERE r.relation NOT IN ('operator', 'can_operate');
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
    RETURN QUERY
        SELECT t.idx::INTEGER, 0
    FROM UNNEST(p_subject_types, p_subject_ids, p_relations, p_object_types, p_object_ids)
      WITH ORDINALITY AS t(subject_type, subject_id, relation, object_type, object_id, idx)
    WHERE t.object_type NOT IN ('channel', 'cloud_workspace', 'organization');
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED
SET search_path = 'authz';


-- ============================================================
-- Explain Functions (7 functions)
-- ============================================================

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


-- Generated explain function for cloud_workspace.operator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."explain_cloud_workspace_operator"(
    p_subject_type TEXT,
    p_subject_id TEXT,
    p_object_id TEXT,
    p_visited TEXT [] DEFAULT ARRAY[]::TEXT[],
    p_max_nodes INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_key TEXT := 'cloud_workspace:' || p_object_id || ':operator';
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
        'relation', 'operator',
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
        'relation', 'operator',
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
    WHERE split_part(p_subject_id, '#', 2) IN ('operator')
    LIMIT 1;
        IF v_userset_check = 1 THEN
        v_root := jsonb_build_object('type', 'userset', 'label', 'self-referential userset matches relation closure', 'result', true);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'operator',
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
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('operator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('agent'))
    LIMIT 1;
    IF FOUND THEN
        v_root := (CASE WHEN v_evidence_tuple.subject_id = '*' THEN jsonb_build_object('type', 'wildcard', 'users', jsonb_build_array(jsonb_build_object('type', v_evidence_tuple.subject_type, 'id', '*')), 'result', true) ELSE jsonb_build_object('type', 'direct', 'label', 'direct grant', 'evidence', jsonb_build_array(jsonb_build_object('subject_type', v_evidence_tuple.subject_type, 'subject_id', v_evidence_tuple.subject_id, 'relation', v_evidence_tuple.relation, 'object_type', v_evidence_tuple.object_type, 'object_id', v_evidence_tuple.object_id)), 'result', true) END);
        v_node_count := v_node_count + 1;
        RETURN jsonb_build_object(
        'object', ('cloud_workspace' || ':' || p_object_id),
        'relation', 'operator',
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
        'relation', 'operator',
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
    WHERE split_part(p_subject_id, '#', 2) IN ('can_operate', 'operator')
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
    WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'operator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')) AND t.subject_type IN ('agent'))
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
        IF p_relation = 'operator' THEN
        RETURN "authz"."explain_cloud_workspace_operator"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."explain_cloud_workspace_can_operate"(p_subject_type, p_subject_id, p_object_id, p_visited, p_max_nodes);
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
-- Expand Functions (7 functions)
-- ============================================================

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


-- Generated expand function for cloud_workspace.operator
-- Returns OpenFGA-shaped UsersetTree JSONB. Shallow by default — computed
-- rewrites surface as Leaf.Computed pointers; callers chase them with
-- follow-up Expand calls or use Checker.ExpandRecursive.
CREATE OR REPLACE FUNCTION "authz"."expand_cloud_workspace_operator"(
    p_object_id TEXT,
    p_subject_type TEXT DEFAULT NULL,
    p_max_leaf INTEGER DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#operator')) || jsonb_build_object('leaf', jsonb_build_object('users', (jsonb_build_object('users', COALESCE((SELECT jsonb_agg(u) FROM (SELECT subject_type || ':' || subject_id AS u FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'operator' AND subject_type IN ('agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) ORDER BY subject_type, subject_id LIMIT p_max_leaf) capped), '[]'::jsonb)) || CASE WHEN (p_max_leaf IS NOT NULL AND EXISTS (SELECT 1 FROM "authz"."melange_tuples" WHERE object_type = 'cloud_workspace' AND object_id = p_object_id AND relation = 'operator' AND subject_type IN ('agent') AND (p_subject_type IS NULL OR subject_type = p_subject_type) OFFSET p_max_leaf)) THEN jsonb_build_object('users_truncated', true) ELSE '{}'::jsonb END))));
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
    RETURN jsonb_build_object('root', jsonb_build_object('name', ('cloud_workspace' || ':' || p_object_id || '#can_operate')) || jsonb_build_object('leaf', jsonb_build_object('computed', jsonb_build_object('userset', ('cloud_workspace' || ':' || p_object_id || '#operator')))));
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
        IF p_relation = 'operator' THEN
        RETURN "authz"."expand_cloud_workspace_operator"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN "authz"."expand_cloud_workspace_can_operate"(p_object_id, p_subject_type, p_max_leaf);
    END IF;
        RETURN jsonb_build_object('root', jsonb_build_object('name', (p_object_type || ':' || p_object_id || '#' || p_relation)) || jsonb_build_object('leaf', jsonb_build_object('users', jsonb_build_object('users', '[]'::jsonb))));
    END IF;
    IF p_object_type = 'organization' THEN
        IF p_relation = 'member' THEN
        RETURN "authz"."expand_organization_member"(p_object_id, p_subject_type, p_max_leaf);
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
-- List Objects Functions (7 functions)
-- ============================================================

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

-- Generated list_objects function for cloud_workspace.operator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_operator_obj"(
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
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('operator') AND t.subject_type = p_subject_type AND p_subject_type IN ('agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('operator'))
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
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'operator') AND t.subject_type = p_subject_type AND p_subject_type IN ('agent') AND (t.subject_id = p_subject_id AND NOT (t.subject_id = '*')))
                UNION
                -- Self-candidate: subject is userset on same object type
                SELECT split_part(p_subject_id, '#', 1) AS object_id
                WHERE (position('#' in p_subject_id) > 0 AND p_subject_type = 'cloud_workspace' AND split_part(p_subject_id, '#', 2) IN ('can_operate', 'operator'))
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
-- List Subjects Functions (7 functions)
-- ============================================================

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
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
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

-- Generated list_subjects function for cloud_workspace.operator
-- Features: Direct
CREATE OR REPLACE FUNCTION "authz"."list_cloud_workspace_operator_sub"(
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
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('operator') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'operator'), ('cloud_workspace', 'operator', 'operator')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'operator', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('operator'))
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
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('operator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
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
                FROM (VALUES ('organization', 'member', 'member')) AS subj_c(object_type, relation, satisfying_relation)
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
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
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
                FROM (VALUES ('channel', 'can_post', 'can_post'), ('channel', 'can_post', 'member'), ('channel', 'can_read', 'can_read'), ('channel', 'can_read', 'member'), ('channel', 'member', 'member'), ('channel', 'organization', 'organization')) AS subj_c(object_type, relation, satisfying_relation)
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
                		WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'operator') AND t.object_id = p_object_id AND t.subject_type = v_filter_type AND position('#' in t.subject_id) > 0 AND (split_part(t.subject_id, '#', 2) = v_filter_relation OR EXISTS (
                SELECT 1
                FROM (VALUES ('cloud_workspace', 'can_operate', 'can_operate'), ('cloud_workspace', 'can_operate', 'operator'), ('cloud_workspace', 'operator', 'operator')) AS subj_c(object_type, relation, satisfying_relation)
                WHERE (subj_c.object_type = v_filter_type AND subj_c.relation = split_part(t.subject_id, '#', 2) AND subj_c.satisfying_relation = v_filter_relation)
                )) AND "authz"."check_permission_internal"(v_filter_type, t.subject_id, 'can_operate', 'cloud_workspace', p_object_id, ARRAY[]::TEXT[]) = 1)
                UNION
                -- Self-candidate: when filter type matches object type
                -- e.g., querying document:1.viewer with filter document#writer
                -- should return document:1#writer if writer satisfies the relation
                SELECT p_object_id || '#' || v_filter_relation AS subject_id
                WHERE (v_filter_type = 'cloud_workspace' AND v_filter_relation IN ('can_operate', 'operator'))
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
                WHERE (t.object_type = 'cloud_workspace' AND t.relation IN ('can_operate', 'operator') AND t.object_id = p_object_id AND t.subject_type = p_subject_type AND position('#' in t.subject_id) = 0 AND t.subject_id <> '*')
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
        IF p_relation = 'operator' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_operator_obj"(p_subject_type, p_subject_id, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_can_operate_obj"(p_subject_type, p_subject_id, p_limit, p_after);
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
        IF p_relation = 'operator' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_operator_sub"(p_object_id, p_subject_type, p_limit, p_after);
        RETURN;
    END IF;
        IF p_relation = 'can_operate' THEN
        RETURN QUERY
        SELECT * FROM "authz"."list_cloud_workspace_can_operate_sub"(p_object_id, p_subject_type, p_limit, p_after);
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
    -- Unknown type/relation pair - return empty result (relation not defined in model)
    -- This matches check_permission behavior for unknown relations (returns 0/denied)
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL RESTRICTED;

-- ============================================================
-- Migration Record
-- ============================================================

INSERT INTO "authz"."melange_migrations" (melange_version, schema_checksum, codegen_version, function_names, function_checksums, schema_dsl, schema_format, model_json)
VALUES ('0.10.1', '143732f19f68bd2715dacd404b293c42673aee6154d04a7e67b7cd75278e5d0f', '0.10.1', ARRAY['check_channel_can_post', 'check_channel_can_read', 'check_channel_member', 'check_channel_organization', 'check_cloud_workspace_can_operate', 'check_cloud_workspace_operator', 'check_organization_member', 'check_permission', 'check_permission_bulk', 'check_permission_internal', 'check_permission_nw', 'check_permission_nw_internal', 'expand_channel_can_post', 'expand_channel_can_read', 'expand_channel_member', 'expand_channel_organization', 'expand_cloud_workspace_can_operate', 'expand_cloud_workspace_operator', 'expand_organization_member', 'expand_permission', 'expand_permission_internal', 'explain_channel_can_post', 'explain_channel_can_read', 'explain_channel_member', 'explain_channel_organization', 'explain_cloud_workspace_can_operate', 'explain_cloud_workspace_operator', 'explain_organization_member', 'explain_permission', 'explain_permission_internal', 'list_accessible_objects', 'list_accessible_subjects', 'list_channel_can_post_obj', 'list_channel_can_post_sub', 'list_channel_can_read_obj', 'list_channel_can_read_sub', 'list_channel_member_obj', 'list_channel_member_sub', 'list_channel_organization_obj', 'list_channel_organization_sub', 'list_cloud_workspace_can_operate_obj', 'list_cloud_workspace_can_operate_sub', 'list_cloud_workspace_operator_obj', 'list_cloud_workspace_operator_sub', 'list_organization_member_obj', 'list_organization_member_sub'], '{"check_channel_can_post":"8062dd7e3756493fc1991005122040152f672df8fd7e2efc222d18cb65a1a048","check_channel_can_read":"dd8c2cbb33781b08a2ee4de703555f2e70b8687fc996d677d1e649cabac52185","check_channel_member":"30f94fed9057504430235389e46f1d594e0511cf8351684fdbf7b56e3b326ebe","check_channel_organization":"8552d02e9179552fbf3306f4d60814b62e26838ef31e9892fdae211f237aba25","check_cloud_workspace_can_operate":"046e2c30fdb013526d897c6db09bc3cd5a84839dafbd1cb589be7882c99fdd90","check_cloud_workspace_operator":"1d4b597c2f63382bf40adea34d352b876dadbc0e5ddff1db4d5c220c2035ef8a","check_organization_member":"38caaad5c712e56dd7545e0473d02f541e3bc7f5e3c5010b3c761d2720ae460e","check_permission":"50f5825c48000e9df715407ec2830ecda98a3c71ea787e318e5db3f640be7acc","check_permission_bulk":"4eadd3fd83fa6d25d7a5b6c5da1469aff047abcb0d018bbe1301507e80aae42a","check_permission_nw":"169ef121564422a31a6e725eb7ea6cd46d2dbab9c5179b05669154e14e19a35a","expand_channel_can_post":"1aea8d02e3766bd7f3b5fe0c973b083a3bed334f0f10d60451d12e1bfe129e1d","expand_channel_can_read":"c5f75e55c4c6200a4b4991b49b4c20307186b61e89adf48ee380bad52442e766","expand_channel_member":"a84704a35b311ac10630df7cbba6a1d4282408f65e3bc6f828001fd93af28104","expand_channel_organization":"23bf14131c36605b9602dfd2bd75ae61eb9caebcd361c7f27388509a3f9a8461","expand_cloud_workspace_can_operate":"140aad392c730f4f67f87d7a3a365439bf6111a33fd6381549f65984d9d0568b","expand_cloud_workspace_operator":"46a2b2ab37025e1d15a3e0cd4ba4d973bd639209321f39083ce3a320381f24a9","expand_organization_member":"53be76cec6bbae733148d2933d3d341e36678ad15fd1a0dd3b4b974aead7c9f9","expand_permission":"eac3ca3232b7b0a9c32b3d614c3968aeea9d0860f81da002dc2cc9d457e64883","explain_channel_can_post":"2cd8594bc329ff09ac444bb2ab2a49c79e54c40f74818725f1842b57ff20d643","explain_channel_can_read":"a75fd832f83c4c147ddb8836ada07d5679196c8c0685a90fc9ad75a448e6a7bb","explain_channel_member":"df4e3ebcb2d41240baade18bc515496ef4f1c304dd3d8b5ad6c0456d4d24e424","explain_channel_organization":"a24ced83e234e9ccbbadf72c8fbd42b0bda9b0c5bdfe54085d22d9d1bce4ff93","explain_cloud_workspace_can_operate":"5de39eeed28b27b6cff3eb92ea6a45586aca2d96cbebc2c3632b2cc19175f09b","explain_cloud_workspace_operator":"7f28aa5a5fd3d9f0feba8954b7d6e50989e5d2b6299da631ad63eb2343f59e76","explain_organization_member":"121e5fe6ec5e81fa1e0c71631a0f39e108b3118d000a52ec23a143783ea1c75d","explain_permission":"5e600dc36835253a3f47c58d1931fedf99c32d422f812ea083f482f48fdad0aa","list_accessible_objects":"fca930c245acd03160ba4f9663fac0f2fac41d0f52a6ae797019a24ab92e8029","list_accessible_subjects":"fd0d796e9865eb0e887acf1040ace306fa5bd58a6e43dd4dcd74a7ec0053d587","list_channel_can_post_obj":"db26ebe9087a6eb2150f0c41e49b25d050a168722f32fb22a99abfc7dbd44b8b","list_channel_can_post_sub":"dcb8d8cbafec926b2c48cf3e48c07261addc676e15955a537a49a43a80eb7d90","list_channel_can_read_obj":"ae7d7eb1bbaa6b1520d19e1770147e939177766ae1f0cbc3af62d1bb800a5e1e","list_channel_can_read_sub":"e7fb3d8c0d4fcc7896e7ce39e6ea0eaafa2b424c440646ff1be71a9a87c08d4a","list_channel_member_obj":"4590b5795a6c87b639fa71f26eb6419899811f51e477b4b480c60a45a8aca1ff","list_channel_member_sub":"9ebf5fd9f6c3b021017601db15e054a3cbfcb429629c9ed773bd3256ceacd910","list_channel_organization_obj":"50ac0778a496208e8f941dfb9f95e69403066e7082ff43036a02b414f5255259","list_channel_organization_sub":"2b0f42e86cd8d1c260e0f2cadd7d728febc6043fe73656c0e409ddf56b0b2bf8","list_cloud_workspace_can_operate_obj":"e5747060521db368c01c718e1dc16084fd103fba3f19b9aa44c41920aaec6bb8","list_cloud_workspace_can_operate_sub":"a8491ec9833edf2845d8445a34baefa4e6af88ec44591b48027ad48ddaf34214","list_cloud_workspace_operator_obj":"2a9056a553202f4014c2dad761c983ad9eed2e376487dc025b22c7a2c13db93e","list_cloud_workspace_operator_sub":"97673b66b1d3b7dbf900c32f633f0f4143e5374153efcfeeb2ac0abb8e1dc8d1","list_organization_member_obj":"6ab121db9e8eed5dd123b9efd7ea9ed6e8359d36fee0c70a5fff98bd0c6d6124","list_organization_member_sub":"5e977a918d2118754ee072c5c7157e8fbac76bbb00f95efb8790dc36ee6a6fb1"}', 'model
  schema 1.1

type user

type agent

type organization
  relations
    define member: [user, agent]

type channel
  relations
    define organization: [organization]
    define member: [user, agent]
    define can_read: member
    define can_post: member

type cloud_workspace
  relations
    define operator: [agent]
    define can_operate: operator
', 'single', '[{"Name":"user","Relations":null},{"Name":"agent","Relations":null},{"Name":"organization","Relations":[{"Name":"member","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false},{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"channel","Relations":[{"Name":"can_post","ImpliedBy":["member"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"can_read","ImpliedBy":["member"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"member","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"user","Relation":"","Wildcard":false},{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null},{"Name":"organization","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"organization","Relation":"","Wildcard":false}],"IntersectionGroups":null}]},{"Name":"cloud_workspace","Relations":[{"Name":"can_operate","ImpliedBy":["operator"],"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":null,"IntersectionGroups":null},{"Name":"operator","ImpliedBy":null,"ParentRelations":null,"ExcludedRelations":null,"ExcludedParentRelations":null,"ExcludedIntersectionGroups":null,"SubjectTypeRefs":[{"Type":"agent","Relation":"","Wildcard":false}],"IntersectionGroups":null}]}]');
