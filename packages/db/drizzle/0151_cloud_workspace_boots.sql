ALTER TYPE "public"."automation_run_error_code" ADD VALUE 'cloud_usage_limit_reached';--> statement-breakpoint
CREATE TABLE "cloud_workspace_boots" (
	"id" text PRIMARY KEY NOT NULL,
	"vercel_session_id" text,
	"organization_id" uuid NOT NULL,
	"cloud_workspace_id" uuid,
	"memory_mb" integer NOT NULL,
	"vcpus" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"lock_seq" integer DEFAULT 0 NOT NULL,
	"lock_open" boolean DEFAULT true NOT NULL,
	"finalized_through" timestamp with time zone,
	"settle_lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_workspace_boots_vercel_session_id_unique" UNIQUE("vercel_session_id")
);
--> statement-breakpoint
ALTER TABLE "cloud_workspaces" ADD COLUMN "usage_stop_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD CONSTRAINT "cloud_workspace_boots_cloud_workspace_id_cloud_workspaces_id_fk" FOREIGN KEY ("cloud_workspace_id") REFERENCES "public"."cloud_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_workspace_boots_cloud_workspace_id_idx" ON "cloud_workspace_boots" USING btree ("cloud_workspace_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_boots_organization_id_idx" ON "cloud_workspace_boots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cloud_workspace_boots_open_idx" ON "cloud_workspace_boots" USING btree ("started_at") WHERE "cloud_workspace_boots"."stopped_at" is null or "cloud_workspace_boots"."finalized_through" is null or "cloud_workspace_boots"."finalized_through" < "cloud_workspace_boots"."stopped_at";