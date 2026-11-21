ALTER TABLE `screenshots` ADD `device_key` text;--> statement-breakpoint
CREATE INDEX `screenshots_device_key_captured_at_idx` ON `screenshots` (`device_key`,`captured_at`);