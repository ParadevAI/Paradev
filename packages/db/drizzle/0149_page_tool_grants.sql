CREATE TABLE "page_tool_grants" (
	"page_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin" text NOT NULL,
	"connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_tool_grants_page_id_user_id_plugin_pk" PRIMARY KEY("page_id","user_id","plugin")
);
--> statement-breakpoint
ALTER TABLE "page_tool_grants" ADD CONSTRAINT "page_tool_grants_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_tool_grants" ADD CONSTRAINT "page_tool_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_tool_grants_user_id_idx" ON "page_tool_grants" USING btree ("user_id");