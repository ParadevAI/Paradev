ALTER TABLE "cloud_workspaces" ADD COLUMN "drive_name" text;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "drive_laid_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "golden_drive_name" text;