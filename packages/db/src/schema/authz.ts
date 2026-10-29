import { sql } from "drizzle-orm";
import { pgSchema, text } from "drizzle-orm/pg-core";

/**
 * Agent permissions, checked with Melange: `src/authz/schema.fga` is compiled
 * into SQL functions in this schema (`authz.check_permission(...)`), which
 * read `melange_tuples`. Dropping the schema removes every trace of it.
 */
export const authzSchema = pgSchema("authz");

/**
 * Every relationship Melange can see, read from the tables that already hold
 * it. An archived agent drops out. A Dev operates the box of each task it runs.
 */
export const melangeTuples = authzSchema
	.view("melange_tuples", {
		subjectType: text("subject_type").notNull(),
		subjectId: text("subject_id").notNull(),
		relation: text().notNull(),
		objectType: text("object_type").notNull(),
		objectId: text("object_id").notNull(),
	})
	.as(sql`
		select 'agent'::text as subject_type, a.id::text as subject_id, 'member'::text as relation,
			'organization'::text as object_type, a.organization_id::text as object_id
		from public.agents a where a.archived_at is null
		union all
		select 'agent', a.id::text, 'member', 'channel', m.channel_id::text
		from public.channel_members m
		join public.agents a on a.id = m.actor_id and a.archived_at is null
		union all
		select 'organization', c.organization_id::text, 'organization', 'channel', c.id::text
		from public.channels c where c.archived_at is null
		union all
		select 'agent', s.agent_id::text, 'operator', 'cloud_workspace', s.cloud_workspace_id::text
		from public.agent_sessions s
		join public.agents a on a.id = s.agent_id and a.archived_at is null
		where s.parent_session_id is not null and s.cloud_workspace_id is not null
	`);
