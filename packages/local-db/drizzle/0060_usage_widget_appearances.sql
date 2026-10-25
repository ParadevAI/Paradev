CREATE TABLE `usage_widget_appearances` (
	`organization_id` text NOT NULL,
	`host_id` text NOT NULL,
	`account_id` text NOT NULL,
	`color` text,
	`label` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `host_id`, `account_id`)
);
