ALTER TYPE "public"."cloud_workspace_status" ADD VALUE 'awake';--> statement-breakpoint
ALTER TYPE "public"."cloud_workspace_status" ADD VALUE 'asleep';--> statement-breakpoint
ALTER TYPE "public"."cloud_workspace_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "sandbox_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "sandbox_session_id" text;