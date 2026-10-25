ALTER TABLE "environments" RENAME COLUMN "hooks_repository_id" TO "primary_repository_id";--> statement-breakpoint
ALTER TABLE "environments" DROP CONSTRAINT "environments_hooks_repository_id_github_repositories_id_fk";
--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_primary_repository_id_github_repositories_id_fk" FOREIGN KEY ("primary_repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE set null ON UPDATE no action;