CREATE TABLE `mobile_last_devices` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`device_key` text NOT NULL,
	`picked_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mobile_owned_devices` (
	`platform` text NOT NULL,
	`device_key` text NOT NULL,
	`booted_at` integer NOT NULL,
	PRIMARY KEY(`platform`, `device_key`)
);
