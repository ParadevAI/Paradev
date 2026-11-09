CREATE TABLE `chat_selections` (
	`harness` text NOT NULL,
	`category` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`harness`, `category`)
);
