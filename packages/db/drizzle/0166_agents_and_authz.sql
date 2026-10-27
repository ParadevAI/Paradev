CREATE SCHEMA "authz";
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authz"."agent_relations" (
	"agent_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_relations_agent_id_relation_object_type_object_id_pk" PRIMARY KEY("agent_id","relation","object_type","object_id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."agent_relations" ADD CONSTRAINT "agent_relations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_organization_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE VIEW "authz"."melange_tuples" AS (
		select 'agent'::text as subject_type, r.agent_id::text as subject_id, r.relation,
			r.object_type, r.object_id::text as object_id
		from authz.agent_relations r
		join public.agents a on a.id = r.agent_id and a.archived_at is null
		union all
		select 'agent', a.id::text, 'member', 'organization', a.organization_id::text
		from public.agents a where a.archived_at is null
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
	);