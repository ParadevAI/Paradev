CREATE TYPE "public"."agent_task_role" AS ENUM('writer', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."agent_task_status" AS ENUM('queued', 'running', 'done', 'failed', 'stopped');--> statement-breakpoint
ALTER TYPE "public"."agent_session_kind" ADD VALUE 'main';--> statement-breakpoint
ALTER TYPE "public"."agent_session_kind" ADD VALUE 'task';--> statement-breakpoint
ALTER TYPE "public"."agent_turn_reason" ADD VALUE 'channel_message';--> statement-breakpoint
ALTER TYPE "public"."agent_turn_reason" ADD VALUE 'task_start';--> statement-breakpoint
ALTER TYPE "public"."agent_turn_reason" ADD VALUE 'task_update';--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP VIEW "authz"."melange_tuples";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "parent_session_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "role" "agent_task_role";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "task_status" "agent_task_status";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "pull_request_url" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD COLUMN "last_attempt_error" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "main_session_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "default_environment_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memories_agent_idx" ON "agent_memories" USING btree ("agent_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_default_environment_id_environments_id_fk" FOREIGN KEY ("default_environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_active_task_dedupe_unique" ON "agent_sessions" USING btree ("agent_id","dedupe_key") WHERE "agent_sessions"."dedupe_key" is not null and "agent_sessions"."task_status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "agent_sessions_parent_idx" ON "agent_sessions" USING btree ("parent_session_id");--> statement-breakpoint
CREATE VIEW "authz"."melange_tuples" AS (
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
	);