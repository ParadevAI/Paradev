CREATE SCHEMA "chats";
--> statement-breakpoint
CREATE TYPE "chats"."agent_kind" AS ENUM('personal', 'group', 'custom', 'added');--> statement-breakpoint
CREATE TYPE "chats"."agent_status" AS ENUM('stopped', 'waking', 'idle', 'running');--> statement-breakpoint
CREATE TYPE "chats"."group_kind" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "chats"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "chats"."question_kind" AS ENUM('select', 'confirm', 'input', 'form');--> statement-breakpoint
CREATE TYPE "chats"."question_status" AS ENUM('open', 'answered', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "chats"."turn_status" AS ENUM('queued', 'running', 'ended');--> statement-breakpoint
CREATE TABLE "chats"."agent_reads" (
	"agent_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"last_read_message_at" timestamp with time zone NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_reads_agent_id_group_id_pk" PRIMARY KEY("agent_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "chats"."agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "chats"."agent_kind" NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"look" text,
	"owner_user_id" uuid,
	"group_id" uuid,
	"status" "chats"."agent_status" DEFAULT 'stopped' NOT NULL,
	"box_id" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_kind_owner_check" CHECK (("chats"."agents"."kind" in ('group', 'added') and "chats"."agents"."group_id" is not null and "chats"."agents"."owner_user_id" is null) or ("chats"."agents"."kind" not in ('group', 'added') and "chats"."agents"."group_id" is null and "chats"."agents"."owner_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "chats"."briefs" (
	"group_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefs_group_id_agent_id_pk" PRIMARY KEY("group_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "chats"."group_agents" (
	"group_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_agents_group_id_agent_id_pk" PRIMARY KEY("group_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "chats"."group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "chats"."member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chats"."groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "chats"."group_kind" NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid,
	"jev_spoke_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"author_id" uuid,
	"author_agent_id" uuid,
	"text" text NOT NULL,
	"task_id" uuid,
	"question_id" uuid,
	"file_id" uuid,
	"client_id" text,
	"turn_id" uuid,
	"reply_to_id" uuid,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats"."questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"agent_id" uuid,
	"turn_id" uuid,
	"task_id" uuid,
	"kind" "chats"."question_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_other" boolean DEFAULT false NOT NULL,
	"placeholder" text DEFAULT '' NOT NULL,
	"for_user_id" uuid,
	"status" "chats"."question_status" DEFAULT 'open' NOT NULL,
	"turn_waiting" boolean DEFAULT true NOT NULL,
	"answer" text,
	"answers" jsonb,
	"typed" boolean DEFAULT false NOT NULL,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats"."reads" (
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"last_read_message_at" timestamp with time zone NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reads_user_id_group_id_pk" PRIMARY KEY("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "chats"."turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"message_id" uuid,
	"prompt" text,
	"user_id" uuid,
	"parent_turn_id" uuid,
	"task_id" uuid,
	"status" "chats"."turn_status" DEFAULT 'queued' NOT NULL,
	"superseded" boolean DEFAULT false NOT NULL,
	"box_id" text,
	"answer" text,
	"error" text,
	"trace" jsonb,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats"."agent_reads" ADD CONSTRAINT "agent_reads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."agent_reads" ADD CONSTRAINT "agent_reads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."agents" ADD CONSTRAINT "agents_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."briefs" ADD CONSTRAINT "briefs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."briefs" ADD CONSTRAINT "briefs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."group_agents" ADD CONSTRAINT "group_agents_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."group_agents" ADD CONSTRAINT "group_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."group_agents" ADD CONSTRAINT "group_agents_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."groups" ADD CONSTRAINT "groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "chats"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "chats"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "chats"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."questions" ADD CONSTRAINT "questions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."questions" ADD CONSTRAINT "questions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."questions" ADD CONSTRAINT "questions_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "chats"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."questions" ADD CONSTRAINT "questions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."questions" ADD CONSTRAINT "questions_for_user_id_users_id_fk" FOREIGN KEY ("for_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."questions" ADD CONSTRAINT "questions_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."reads" ADD CONSTRAINT "reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."reads" ADD CONSTRAINT "reads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."turns" ADD CONSTRAINT "turns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."turns" ADD CONSTRAINT "turns_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."turns" ADD CONSTRAINT "turns_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chats"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."turns" ADD CONSTRAINT "turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."turns" ADD CONSTRAINT "turns_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_reads_group_idx" ON "chats"."agent_reads" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_one_personal_per_member_idx" ON "chats"."agents" USING btree ("organization_id","owner_user_id") WHERE "chats"."agents"."kind" = 'personal';--> statement-breakpoint
CREATE UNIQUE INDEX "agents_one_per_group_idx" ON "chats"."agents" USING btree ("group_id") WHERE "chats"."agents"."kind" = 'group';--> statement-breakpoint
CREATE INDEX "agents_owner_idx" ON "chats"."agents" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "group_agents_agent_idx" ON "chats"."group_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "chats"."group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_organization_idx" ON "chats"."groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "messages_group_created_idx" ON "chats"."messages" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_file_idx" ON "chats"."messages" USING btree ("file_id") WHERE "chats"."messages"."file_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_turn_idx" ON "chats"."messages" USING btree ("turn_id") WHERE "chats"."messages"."turn_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_task_idx" ON "chats"."messages" USING btree ("task_id") WHERE "chats"."messages"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_reply_to_idx" ON "chats"."messages" USING btree ("reply_to_id") WHERE "chats"."messages"."reply_to_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_group_client_idx" ON "chats"."messages" USING btree ("group_id","client_id") WHERE "chats"."messages"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "questions_turn_status_idx" ON "chats"."questions" USING btree ("turn_id","status");--> statement-breakpoint
CREATE INDEX "questions_group_idx" ON "chats"."questions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "reads_group_idx" ON "chats"."reads" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "turns_agent_status_idx" ON "chats"."turns" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "turns_agent_group_created_idx" ON "chats"."turns" USING btree ("agent_id","group_id","created_at");--> statement-breakpoint
CREATE INDEX "turns_task_idx" ON "chats"."turns" USING btree ("task_id") WHERE "chats"."turns"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "turns_message_idx" ON "chats"."turns" USING btree ("message_id") WHERE "chats"."turns"."message_id" is not null;