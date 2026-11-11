ALTER TABLE `projects` ADD `kind` text DEFAULT 'repository' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `parent_project_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `parent_workspace_id` text;