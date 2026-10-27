CREATE TYPE "public"."agent_session_kind" AS ENUM('dm', 'channel', 'thread', 'task');--> statement-breakpoint
CREATE TYPE "public"."agent_turn_reason" AS ENUM('direct_message', 'mention', 'thread_reply', 'dispatch', 'automation', 'schedule', 'wake');--> statement-breakpoint
CREATE TYPE "public"."agent_turn_status" AS ENUM('running', 'completed', 'failed', 'interrupted');--> statement-breakpoint
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
	"steer_count" integer DEFAULT 0 NOT NULL,
	"settled_at" timestamp with time zone,
	"reply" text,
	"tool_calls" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros_usd" bigint,
	"error_code" text
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX "agent_sessions_dm_unique" ON "agent_sessions" USING btree ("agent_id","user_id") WHERE "agent_sessions"."kind" = 'dm';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_channel_unique" ON "agent_sessions" USING btree ("agent_id","channel_id") WHERE "agent_sessions"."kind" = 'channel';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_thread_unique" ON "agent_sessions" USING btree ("agent_id","thread_root_id") WHERE "agent_sessions"."kind" = 'thread';--> statement-breakpoint
CREATE INDEX "agent_sessions_parent_idx" ON "agent_sessions" USING btree ("parent_session_id");--> statement-breakpoint
CREATE INDEX "agent_turns_session_idx" ON "agent_turns" USING btree ("session_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_turns_agent_status_idx" ON "agent_turns" USING btree ("agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_one_running_per_session_idx" ON "agent_turns" USING btree ("session_id") WHERE "agent_turns"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_prompt_idx" ON "agent_turns" USING btree ("session_id","prompt_id") WHERE "agent_turns"."prompt_id" is not null;