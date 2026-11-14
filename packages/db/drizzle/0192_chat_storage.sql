-- Search text for chat_items.search. The default tokenizer keeps paths and
-- dotted or camelCase names as one word, so code names never match a search.
-- This adds a copy split on / . _ : and on camelCase. Written by hand,
-- above the generated statements: chat_items.search is generated from it.

CREATE OR REPLACE FUNCTION chat_search_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
	SELECT t || ' ' || regexp_replace(
		regexp_replace(t, '([a-z0-9])([A-Z])', '\1 \2', 'g'),
		'[/._:()\[\]{}<>`#=-]+', ' ', 'g'
	)
$$;
--> statement-breakpoint
CREATE TABLE "chat_items" (
	"session_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"turn_id" text NOT NULL,
	"kind" text NOT NULL,
	"seq" integer NOT NULL,
	"first_seq" integer NOT NULL,
	"epoch" text NOT NULL,
	"started_at" timestamp with time zone,
	"body" jsonb NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', chat_search_text(search_text))) STORED,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_items_session_id_item_id_pk" PRIMARY KEY("session_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "chat_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"harness" text NOT NULL,
	"harness_session_id" text NOT NULL,
	"source_cwd" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_turns" (
	"session_id" uuid NOT NULL,
	"turn_id" text NOT NULL,
	"seq" integer NOT NULL,
	"first_seq" integer NOT NULL,
	"epoch" text NOT NULL,
	"status" text NOT NULL,
	"body" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"usage" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_turns_session_id_turn_id_pk" PRIMARY KEY("session_id","turn_id")
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "harness" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "harness_session_id" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "epoch" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "last_seq" integer;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "chat_items" ADD CONSTRAINT "chat_items_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_items" ADD CONSTRAINT "chat_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_items" ADD CONSTRAINT "chat_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_transcripts" ADD CONSTRAINT "chat_transcripts_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_transcripts" ADD CONSTRAINT "chat_transcripts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_transcripts" ADD CONSTRAINT "chat_transcripts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_items_session_first_seq_idx" ON "chat_items" USING btree ("session_id","first_seq");--> statement-breakpoint
CREATE INDEX "chat_items_created_by_idx" ON "chat_items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "chat_items_search_idx" ON "chat_items" USING gin ("search");--> statement-breakpoint
CREATE INDEX "chat_transcripts_session_created_at_idx" ON "chat_transcripts" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_transcripts_file_id_idx" ON "chat_transcripts" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "chat_turns_session_first_seq_idx" ON "chat_turns" USING btree ("session_id","first_seq");--> statement-breakpoint
-- BM25 ranking for chat search through Neon's lakebase_text. Only Neon
-- projects with Lakebase Search have the extension; plain Postgres (local
-- docker, CI) and other Neon projects skip this, and chat search falls back
-- to the GIN index. Written by hand: Drizzle cannot express the condition.

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'lakebase_text') THEN
		CREATE EXTENSION IF NOT EXISTS lakebase_text;
		CREATE INDEX IF NOT EXISTS chat_items_search_bm25 ON chat_items USING lakebase_bm25 (search);
	END IF;
END
$$;
