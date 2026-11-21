CREATE TYPE "public"."cloud_usage_feature" AS ENUM('box_gb_minutes', 'active_cpu_minutes');--> statement-breakpoint
CREATE TYPE "public"."cloud_workspace_boot_end_reason" AS ENUM('idle', 'user', 'usage_limit', 'archived', 'restarted', 'failed', 'released', 'crashed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."cloud_workspace_failure_reason" AS ENUM('usage_limit', 'needs_paid_plan', 'host_not_ready', 'create_failed', 'queue_failed', 'sandbox_gone', 'snapshot_expired');--> statement-breakpoint
CREATE TABLE "cloud_usage_events" (
	"boot_id" text NOT NULL,
	"lock_seq" integer NOT NULL,
	"feature" "cloud_usage_feature" NOT NULL,
	"organization_id" uuid NOT NULL,
	"cloud_workspace_id" uuid,
	"user_id" uuid,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"amount" numeric NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_usage_events_boot_id_lock_seq_feature_pk" PRIMARY KEY("boot_id","lock_seq","feature")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "end_reason" "cloud_workspace_boot_end_reason";--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "active_cpu_ms" bigint;--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "egress_bytes" bigint;--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "phases" jsonb;--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "failure_reason" "cloud_workspace_failure_reason";--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_usage_events" ADD CONSTRAINT "cloud_usage_events_boot_id_cloud_workspace_boots_id_fk" FOREIGN KEY ("boot_id") REFERENCES "public"."cloud_workspace_boots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_usage_events_organization_id_sent_at_idx" ON "cloud_usage_events" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "cloud_usage_events_unsent_idx" ON "cloud_usage_events" USING btree ("created_at") WHERE "cloud_usage_events"."sent_at" is null;