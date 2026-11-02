CREATE TYPE "public"."environment_build_kind" AS ENUM('incremental', 'fresh');--> statement-breakpoint
CREATE TYPE "public"."environment_build_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."environment_build_trigger" AS ENUM('manual', 'daily', 'repositories', 'promote');--> statement-breakpoint
CREATE TABLE "environment_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"started_by_user_id" uuid,
	"status" "environment_build_status" DEFAULT 'running' NOT NULL,
	"trigger" "environment_build_trigger" NOT NULL,
	"kind" "environment_build_kind" NOT NULL,
	"repository_ids" uuid[] NOT NULL,
	"primary_repository_id" uuid,
	"base_branch" text,
	"commit_sha" text,
	"golden_ref" text,
	"golden_deleted_at" timestamp with time zone,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "environment_builds" ADD CONSTRAINT "environment_builds_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_builds_environment_id_started_at_idx" ON "environment_builds" USING btree ("environment_id","started_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "environment_builds_one_running_idx" ON "environment_builds" USING btree ("environment_id") WHERE "environment_builds"."status" = 'running';