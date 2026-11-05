CREATE TYPE "public"."channel_member_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."channel_notify" AS ENUM('all', 'mentions', 'none');--> statement-breakpoint
CREATE TYPE "public"."channel_visibility" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TYPE "public"."attachment_parent_kind" ADD VALUE 'channel_message';--> statement-breakpoint
CREATE TABLE "channel_members" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "channel_member_role" DEFAULT 'member' NOT NULL,
	"notify" "channel_notify" DEFAULT 'mentions' NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"last_read_seq" bigint DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_members_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channel_message_reactions" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_message_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"thread_root_id" uuid,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"client_id" text,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_reply_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_tasks" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_thread_follows" (
	"root_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"following" boolean DEFAULT true NOT NULL,
	"last_read_seq" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_thread_follows_root_id_user_id_pk" PRIMARY KEY("root_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" "channel_visibility" DEFAULT 'public' NOT NULL,
	"created_by_user_id" uuid,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_message_id_channel_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_thread_root_id_channel_messages_id_fk" FOREIGN KEY ("thread_root_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_tasks" ADD CONSTRAINT "channel_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_tasks" ADD CONSTRAINT "channel_tasks_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_thread_follows" ADD CONSTRAINT "channel_thread_follows_root_id_channel_messages_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_thread_follows" ADD CONSTRAINT "channel_thread_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_thread_follows" ADD CONSTRAINT "channel_thread_follows_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_members_user_idx" ON "channel_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_messages_channel_seq_unique" ON "channel_messages" USING btree ("channel_id","seq");--> statement-breakpoint
CREATE INDEX "channel_messages_thread_idx" ON "channel_messages" USING btree ("thread_root_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_messages_author_client_unique" ON "channel_messages" USING btree ("author_user_id","client_id") WHERE "channel_messages"."client_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "channel_tasks_channel_id_idx" ON "channel_tasks" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_thread_follows_user_idx" ON "channel_thread_follows" USING btree ("user_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_org_name_unique" ON "channels" USING btree ("organization_id",lower("name")) WHERE "channels"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "channels_organization_idx" ON "channels" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "task_activity" ADD COLUMN "from_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "task_activity" ADD COLUMN "to_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_from_channel_id_channels_id_fk" FOREIGN KEY ("from_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_to_channel_id_channels_id_fk" FOREIGN KEY ("to_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_activity_from_channel_id_idx" ON "task_activity" USING btree ("from_channel_id");--> statement-breakpoint
CREATE INDEX "task_activity_to_channel_id_idx" ON "task_activity" USING btree ("to_channel_id");