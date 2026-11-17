CREATE TABLE "chats"."agent_seed_files" (
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_seed_files_agent_id_path_pk" PRIMARY KEY("agent_id","path")
);
--> statement-breakpoint
ALTER TABLE "chats"."agents" ADD COLUMN "listing_slug" text;--> statement-breakpoint
ALTER TABLE "chats"."agents" ADD COLUMN "listing_version" text;--> statement-breakpoint
ALTER TABLE "chats"."agent_seed_files" ADD CONSTRAINT "agent_seed_files_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "chats"."agents"("id") ON DELETE cascade ON UPDATE no action;