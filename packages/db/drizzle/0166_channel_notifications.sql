CREATE TYPE "public"."channel_broadcast" AS ENUM('here', 'channel', 'everyone');--> statement-breakpoint
CREATE TYPE "public"."dock_bounce" AS ENUM('off', 'once', 'until_focused');--> statement-breakpoint
CREATE TABLE "channel_notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"notify" "channel_notify" DEFAULT 'mentions' NOT NULL,
	"show_preview" boolean DEFAULT true NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"paused_until" timestamp with time zone,
	"schedule_enabled" boolean DEFAULT false NOT NULL,
	"schedule_days" integer[] DEFAULT '{0,1,2,3,4,5,6}'::integer[] NOT NULL,
	"schedule_start_minute" integer DEFAULT 480 NOT NULL,
	"schedule_end_minute" integer DEFAULT 1320 NOT NULL,
	"time_zone" text,
	"dock_bounce" "dock_bounce" DEFAULT 'off' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_members" ALTER COLUMN "notify" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "channel_members" ALTER COLUMN "notify" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "suppress_broadcasts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "broadcast" "channel_broadcast";--> statement-breakpoint
ALTER TABLE "channel_notification_prefs" ADD CONSTRAINT "channel_notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;