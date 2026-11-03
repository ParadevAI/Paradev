ALTER TABLE `terminal_sessions` ADD `agent_lifecycle_owner` text DEFAULT 'paradev' NOT NULL;--> statement-breakpoint
ALTER TABLE `terminal_sessions` ADD `external_ended_at` integer;