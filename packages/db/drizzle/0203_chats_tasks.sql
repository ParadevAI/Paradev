CREATE TYPE "chats"."task_note_kind" AS ENUM('created', 'assigned', 'scheduled', 'started', 'progress', 'comment', 'status', 'done', 'reopened', 'reminded', 'edited', 'failed');--> statement-breakpoint
CREATE TABLE "chats"."task_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" "chats"."task_note_kind" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats"."task_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assignee_user_id" uuid,
	"assignee_agent_id" uuid,
	"rrule" text NOT NULL,
	"timezone" text NOT NULL,
	"dtstart" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone,
	"created_by" uuid,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats"."tasks" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"assignee_agent_id" uuid,
	"created_by_agent_id" uuid,
	"scheduled_at" timestamp with time zone,
	"remind" boolean DEFAULT false NOT NULL,
	"schedule_version" integer DEFAULT 0 NOT NULL,
	"series_id" uuid,
	"occurrence_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats"."task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_notes" ADD CONSTRAINT "task_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_notes" ADD CONSTRAINT "task_notes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_series" ADD CONSTRAINT "task_series_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_series" ADD CONSTRAINT "task_series_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_series" ADD CONSTRAINT "task_series_assignee_agent_id_agents_id_fk" FOREIGN KEY ("assignee_agent_id") REFERENCES "chats"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_series" ADD CONSTRAINT "task_series_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."task_series" ADD CONSTRAINT "task_series_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."tasks" ADD CONSTRAINT "tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."tasks" ADD CONSTRAINT "tasks_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."tasks" ADD CONSTRAINT "tasks_assignee_agent_id_agents_id_fk" FOREIGN KEY ("assignee_agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."tasks" ADD CONSTRAINT "tasks_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."tasks" ADD CONSTRAINT "tasks_series_id_task_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "chats"."task_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_notes_task_created_idx" ON "chats"."task_notes" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_series_group_idx" ON "chats"."task_series" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tasks_group_idx" ON "chats"."tasks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_agent_idx" ON "chats"."tasks" USING btree ("assignee_agent_id") WHERE "chats"."tasks"."assignee_agent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_series_occurrence_idx" ON "chats"."tasks" USING btree ("series_id","occurrence_at") WHERE "chats"."tasks"."series_id" is not null;