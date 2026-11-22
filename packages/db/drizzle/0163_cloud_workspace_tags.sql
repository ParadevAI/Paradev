CREATE TABLE "cloud_workspace_tags" (
	"cloud_workspace_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspace_tags_cloud_workspace_id_tag_created_by_user_id_pk" PRIMARY KEY("cloud_workspace_id","tag","created_by_user_id")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspace_tags" ADD CONSTRAINT "cloud_workspace_tags_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_workspace_tags" ADD CONSTRAINT "cloud_workspace_tags_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;