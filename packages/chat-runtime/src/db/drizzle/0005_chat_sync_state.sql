CREATE TABLE `chat_sync_state` (
	`session_id` text PRIMARY KEY NOT NULL,
	`epoch` text NOT NULL,
	`pushed_seq` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
