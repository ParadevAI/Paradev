ALTER TABLE "github_installations" DROP CONSTRAINT "github_installations_org_unique";--> statement-breakpoint
CREATE INDEX "github_installations_organization_id_idx" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "github_installations_connected_by_user_id_idx" ON "github_installations" USING btree ("connected_by_user_id");