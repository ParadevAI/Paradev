PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text,
	`device_key` text,
	`filename` text NOT NULL,
	`save_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`thumbnail` text NOT NULL,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_screenshots`("id", "url", "device_key", "filename", "save_path", "width", "height", "thumbnail", "captured_at") SELECT "id", "url", "device_key", "filename", "save_path", "width", "height", "thumbnail", "captured_at" FROM `screenshots`;--> statement-breakpoint
DROP TABLE `screenshots`;--> statement-breakpoint
ALTER TABLE `__new_screenshots` RENAME TO `screenshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `screenshots_captured_at_idx` ON `screenshots` (`captured_at`);--> statement-breakpoint
CREATE INDEX `screenshots_device_key_captured_at_idx` ON `screenshots` (`device_key`,`captured_at`);