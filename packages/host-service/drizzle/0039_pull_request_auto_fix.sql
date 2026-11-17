CREATE TABLE `pull_request_auto_fix` (
	`workspace_id` text NOT NULL,
	`pull_request_url` text NOT NULL,
	`pr_number` integer NOT NULL,
	`status` text NOT NULL,
	`pause_reason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_handled_head_sha` text,
	`agent_terminal_id` text,
	`fix_sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `pull_request_url`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pull_request_auto_fix_url_unique` ON `pull_request_auto_fix` (`pull_request_url`);