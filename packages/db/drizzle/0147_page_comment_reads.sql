CREATE TABLE "page_comment_reads" (
	"user_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_comment_reads_user_id_page_id_pk" PRIMARY KEY("user_id","page_id")
);
--> statement-breakpoint
ALTER TABLE "page_comment_reads" ADD CONSTRAINT "page_comment_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_reads" ADD CONSTRAINT "page_comment_reads_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_comment_reads_page_id_idx" ON "page_comment_reads" USING btree ("page_id");