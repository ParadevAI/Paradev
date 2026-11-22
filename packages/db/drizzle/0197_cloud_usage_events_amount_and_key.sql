ALTER TABLE "cloud_usage_events" DROP CONSTRAINT "cloud_usage_events_boot_id_lock_seq_feature_pk";--> statement-breakpoint
ALTER TABLE "cloud_usage_events" ALTER COLUMN "amount" SET DATA TYPE numeric(20, 6);--> statement-breakpoint
ALTER TABLE "cloud_usage_events" ADD CONSTRAINT "cloud_usage_events_boot_id_lock_seq_feature_window_from_pk" PRIMARY KEY("boot_id","lock_seq","feature","window_from");