CREATE SCHEMA "authz";
--> statement-breakpoint
CREATE TYPE "public"."agent_session_kind" AS ENUM('dm', 'thread');--> statement-breakpoint
CREATE TYPE "public"."agent_turn_reason" AS ENUM('direct_message', 'mention', 'thread_reply');--> statement-breakpoint
CREATE TYPE "public"."agent_turn_status" AS ENUM('running', 'completed', 'failed', 'interrupted');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	CONSTRAINT "actors_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "actors_agent_id_unique" UNIQUE("agent_id"),
	CONSTRAINT "actors_one_kind" CHECK (("actors"."user_id" IS NULL) <> ("actors"."agent_id" IS NULL)),
	CONSTRAINT "actors_id_matches" CHECK ("actors"."id" = coalesce("actors"."user_id", "actors"."agent_id"))
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"kind" "agent_session_kind" NOT NULL,
	"channel_id" uuid,
	"thread_root_id" uuid,
	"user_id" uuid,
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
	"paused_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_thread_root_id_channel_messages_id_fk" FOREIGN KEY ("thread_root_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_acting_user_id_users_id_fk" FOREIGN KEY ("acting_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_trigger_message_id_channel_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."channel_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_dm_unique" ON "agent_sessions" USING btree ("agent_id","user_id") WHERE "agent_sessions"."kind" = 'dm';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_thread_unique" ON "agent_sessions" USING btree ("agent_id","thread_root_id") WHERE "agent_sessions"."kind" = 'thread';--> statement-breakpoint
CREATE INDEX "agent_turns_session_idx" ON "agent_turns" USING btree ("session_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_turns_agent_status_idx" ON "agent_turns" USING btree ("agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_one_running_per_session_idx" ON "agent_turns" USING btree ("session_id") WHERE "agent_turns"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_prompt_idx" ON "agent_turns" USING btree ("session_id","prompt_id") WHERE "agent_turns"."prompt_id" is not null;--> statement-breakpoint
CREATE INDEX "agents_organization_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE VIEW "authz"."melange_tuples" AS (
		select 'agent'::text as subject_type, a.id::text as subject_id, 'member'::text as relation,
			'organization'::text as object_type, a.organization_id::text as object_id
		from public.agents a where a.archived_at is null
		union all
		select 'organization', c.organization_id::text, 'organization', 'channel', c.id::text
		from public.channels c where c.archived_at is null
	);