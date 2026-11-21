CREATE TABLE "environment_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_projects_environment_id_project_id_unique" UNIQUE("environment_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "environment_projects" ADD CONSTRAINT "environment_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_projects" ADD CONSTRAINT "environment_projects_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_projects_project_id_idx" ON "environment_projects" USING btree ("project_id");