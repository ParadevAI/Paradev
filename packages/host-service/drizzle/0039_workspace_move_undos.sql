CREATE TABLE `workspace_move_undos` (
	`workspace_move_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`stopped_terminal_ids` text NOT NULL,
	`handing_off_terminal_ids` text NOT NULL,
	`followed_chat_ids` text NOT NULL,
	`created_at` integer NOT NULL
);
