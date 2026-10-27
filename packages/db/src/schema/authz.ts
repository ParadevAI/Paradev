import { sql } from "drizzle-orm";
import {
	pgSchema,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";

/**
 * Agent permissions, checked with Melange: `src/authz/schema.fga` is compiled
 * into SQL functions in this schema (`authz.check_permission(...)`), which
 * read `melange_tuples`. Dropping the schema removes every trace of it.
 * An archived agent's grants drop out of the view, so it can do nothing.
 */
export const authzSchema = pgSchema("authz");

/** What an agent has been given: `agent` has `relation` on `object_type:object_id`. */
export const agentRelations = authzSchema.table(
	"agent_relations",
	{
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		relation: text().notNull(),
		objectType: text("object_type").notNull(),
		objectId: uuid("object_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({
			columns: [t.agentId, t.relation, t.objectType, t.objectId],
		}),
	],
);

/** Every relationship Melange can see: agent grants plus links our tables already hold, such as a Dev's channel memberships. */
export const melangeTuples = authzSchema
	.view("melange_tuples", {
		subjectType: text("subject_type").notNull(),
		subjectId: text("subject_id").notNull(),
		relation: text().notNull(),
		objectType: text("object_type").notNull(),
		objectId: text("object_id").notNull(),
	})
	.as(sql`
		select 'agent'::text as subject_type, r.agent_id::text as subject_id, r.relation,
			r.object_type, r.object_id::text as object_id
		from authz.agent_relations r
		join public.agents a on a.id = r.agent_id and a.archived_at is null
		union all
		select 'agent', a.id::text, 'member', 'organization', a.organization_id::text
		from public.agents a where a.archived_at is null
		union all
		select 'agent', m.agent_id::text, 'member', 'channel', m.channel_id::text
		from public.channel_members m
		join public.agents a on a.id = m.agent_id and a.archived_at is null
		union all
		select 'organization', c.organization_id::text, 'organization', 'channel', c.id::text
		from public.channels c where c.archived_at is null
		union all
		select 'channel', ct.channel_id::text, 'channel', 'task', ct.task_id::text
		from public.channel_tasks ct
		union all
		select 'organization', t.organization_id::text, 'organization', 'task', t.id::text
		from public.tasks t where t.deleted_at is null
		union all
		select 'user', w.created_by_user_id::text, 'creator', 'cloud_workspace', w.id::text
		from public.cloud_workspaces w where w.created_by_user_id is not null
		union all
		select 'organization', w.organization_id::text, 'organization', 'cloud_workspace', w.id::text
		from public.cloud_workspaces w
	`);
