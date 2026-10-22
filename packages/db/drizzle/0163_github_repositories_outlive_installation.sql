ALTER TABLE "github_installations" DROP CONSTRAINT "github_installations_org_unique";--> statement-breakpoint
ALTER TABLE "github_repositories" DROP CONSTRAINT "github_repositories_installation_id_github_installations_id_fk";
--> statement-breakpoint
ALTER TABLE "github_repositories" ALTER COLUMN "installation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "disconnected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_installations_org_id_idx" ON "github_installations" USING btree ("organization_id");