CREATE TABLE "inbox_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_by_user_id" uuid,
	"agent_session_id" text NOT NULL,
	"workspace_id" uuid,
	"host_id" text,
	"key" text,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"body" text,
	"page_id" uuid,
	"document" jsonb,
	"document_version" integer DEFAULT 0 NOT NULL,
	"show_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_waits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"agent_session_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_cards" ADD CONSTRAINT "inbox_cards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_cards" ADD CONSTRAINT "inbox_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_cards" ADD CONSTRAINT "inbox_cards_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_cards" ADD CONSTRAINT "inbox_cards_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_waits" ADD CONSTRAINT "inbox_waits_card_id_inbox_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."inbox_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_cards_session_key_unique" ON "inbox_cards" USING btree ("agent_session_id","key") WHERE "inbox_cards"."key" is not null;--> statement-breakpoint
CREATE INDEX "inbox_cards_user_open_idx" ON "inbox_cards" USING btree ("user_id","created_at" desc) WHERE "inbox_cards"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "inbox_cards_user_id_created_at_idx" ON "inbox_cards" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "inbox_waits_card_id_idx" ON "inbox_waits" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "inbox_waits_expires_at_idx" ON "inbox_waits" USING btree ("expires_at");