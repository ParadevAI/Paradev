CREATE SCHEMA "authz";
--> statement-breakpoint
CREATE TYPE "public"."agent_message_access" AS ENUM('organization', 'creator');--> statement-breakpoint
CREATE TYPE "public"."agent_session_kind" AS ENUM('dm', 'channel', 'thread', 'task');--> statement-breakpoint
CREATE TYPE "public"."agent_turn_reason" AS ENUM('direct_message', 'mention', 'thread_reply', 'dispatch', 'automation', 'schedule', 'wake');--> statement-breakpoint
CREATE TYPE "public"."agent_turn_status" AS ENUM('running', 'completed', 'failed', 'interrupted');--> statement-breakpoint
CREATE TYPE "public"."channel_kind" AS ENUM('channel', 'dm');--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"kind" "agent_session_kind" NOT NULL,
	"channel_id" uuid,
	"thread_root_id" uuid,
	"user_id" uuid,
	"parent_session_id" uuid,
	"cloud_workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"status" "agent_turn_status" DEFAULT 'running' NOT NULL,
	"reason" "agent_turn_reason" NOT NULL,
	"acting_user_id" uuid,
	"trigger_message_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prompt_id" text,
	"steer_prompt_ids" text[] DEFAULT '{}' NOT NULL,
	"settled_at" timestamp with time zone,
	"reply" text,
	"tool_calls" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros_usd" bigint,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"avatar" jsonb DEFAULT '{"shape":"pebble","eyes":"dots","color":"#7aa7ff"}'::jsonb NOT NULL,
	"instructions" text,
	"model" text,
	"message_access" "agent_message_access" DEFAULT 'organization' NOT NULL,
	"paused_at" timestamp with time zone,
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
DROP INDEX "channels_org_name_unique";--> statement-breakpoint
ALTER TABLE "channel_members" DROP CONSTRAINT "channel_members_channel_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "channel_members" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "author_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "mentioned_agent_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "kind" "channel_kind" DEFAULT 'channel' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_thread_root_id_channel_messages_id_fk" FOREIGN KEY ("thread_root_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_parent_session_id_agent_sessions_id_fk" FOREIGN KEY ("parent_session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_acting_user_id_users_id_fk" FOREIGN KEY ("acting_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_trigger_message_id_channel_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."channel_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz"."agent_relations" ADD CONSTRAINT "agent_relations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_dm_unique" ON "agent_sessions" USING btree ("agent_id","user_id") WHERE "agent_sessions"."kind" = 'dm';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_channel_unique" ON "agent_sessions" USING btree ("agent_id","channel_id") WHERE "agent_sessions"."kind" = 'channel';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_thread_unique" ON "agent_sessions" USING btree ("agent_id","thread_root_id") WHERE "agent_sessions"."kind" = 'thread';--> statement-breakpoint
CREATE INDEX "agent_sessions_parent_idx" ON "agent_sessions" USING btree ("parent_session_id");--> statement-breakpoint
CREATE INDEX "agent_turns_session_idx" ON "agent_turns" USING btree ("session_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_turns_agent_status_idx" ON "agent_turns" USING btree ("agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_one_running_per_session_idx" ON "agent_turns" USING btree ("session_id") WHERE "agent_turns"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_prompt_idx" ON "agent_turns" USING btree ("session_id","prompt_id") WHERE "agent_turns"."prompt_id" is not null;--> statement-breakpoint
CREATE INDEX "agents_organization_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_members_channel_user_unique" ON "channel_members" USING btree ("channel_id","user_id") WHERE "channel_members"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_members_channel_agent_unique" ON "channel_members" USING btree ("channel_id","agent_id") WHERE "channel_members"."agent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "channel_members_agent_idx" ON "channel_members" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_messages_agent_client_unique" ON "channel_messages" USING btree ("author_agent_id","channel_id","client_id") WHERE "channel_messages"."client_id" IS NOT NULL AND "channel_messages"."author_agent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_org_name_unique" ON "channels" USING btree ("organization_id",lower("name")) WHERE "channels"."archived_at" IS NULL AND "channels"."kind" = 'channel';--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_one_member" CHECK (("channel_members"."user_id" IS NULL) <> ("channel_members"."agent_id" IS NULL));--> statement-breakpoint
CREATE VIEW "authz"."melange_tuples" AS (
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
	);