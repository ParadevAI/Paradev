ALTER TYPE "public"."agent_turn_reason" ADD VALUE 'routine';--> statement-breakpoint
CREATE TABLE "agent_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"thread_root_id" uuid,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"schedule" jsonb,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_turns" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_routines" ADD CONSTRAINT "agent_routines_thread_root_id_channel_messages_id_fk" FOREIGN KEY ("thread_root_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_routines_agent_idx" ON "agent_routines" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_routines_due_idx" ON "agent_routines" USING btree ("next_run_at") WHERE "agent_routines"."enabled" and "agent_routines"."next_run_at" is not null;--> statement-breakpoint
CREATE INDEX "agent_routines_triggers_idx" ON "agent_routines" USING btree ("organization_id") WHERE "agent_routines"."enabled" and jsonb_array_length("agent_routines"."triggers") > 0;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_routine_id_agent_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."agent_routines"("id") ON DELETE set null ON UPDATE no action;