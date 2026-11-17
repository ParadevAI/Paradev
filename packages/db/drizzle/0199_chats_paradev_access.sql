CREATE TABLE "chats"."app_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid,
	"owner_user_id" uuid,
	"asked_by_user_id" uuid,
	"group_id" uuid,
	"app" text NOT NULL,
	"tool" text NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats"."agents" ADD COLUMN "paradev_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chats"."app_calls" ADD CONSTRAINT "app_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."app_calls" ADD CONSTRAINT "app_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."app_calls" ADD CONSTRAINT "app_calls_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."app_calls" ADD CONSTRAINT "app_calls_asked_by_user_id_users_id_fk" FOREIGN KEY ("asked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats"."app_calls" ADD CONSTRAINT "app_calls_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "chats"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_calls_owner_created_idx" ON "chats"."app_calls" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "app_calls_agent_created_idx" ON "chats"."app_calls" USING btree ("agent_id","created_at");