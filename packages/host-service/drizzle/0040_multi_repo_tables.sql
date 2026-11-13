CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`repo_path` text NOT NULL,
	`provider` text,
	`owner` text,
	`repo_name` text,
	`url` text,
	`remote_name` text,
	`sparse_checkout_paths` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_project_name_unique` ON `repositories` (`project_id`,`name`);
--> statement-breakpoint
CREATE INDEX `repositories_repo_path_idx` ON `repositories` (`repo_path`);
--> statement-breakpoint
-- Every project becomes a repository with the same id, so pull_requests.project_id
-- copies into repository_id unchanged. A prototype child project becomes a
-- repository of its parent, named after its folder (its checkout was root/<folder>);
-- a repeated folder name in one project gets the repository id's first 8 characters.
INSERT INTO `repositories` (`id`, `project_id`, `name`, `repo_path`, `provider`, `owner`, `repo_name`, `url`, `remote_name`, `sparse_checkout_paths`, `created_at`, `updated_at`)
SELECT
	`id`,
	`owning_project_id`,
	CASE WHEN `name_rank` = 1 THEN `base_name` ELSE `base_name` || '-' || substr(`id`, 1, 8) END,
	`repo_path`, `repo_provider`, `repo_owner`, `repo_name`, `repo_url`, `remote_name`, `sparse_checkout_paths`,
	`created_at`,
	MAX(`updated_at`, `created_at`)
FROM (
	SELECT
		named.*,
		ROW_NUMBER() OVER (PARTITION BY `owning_project_id`, `base_name` ORDER BY `created_at`, `id`) AS `name_rank`
	FROM (
		SELECT
			trimmed.*,
			COALESCE(`parent_project_id`, `id`) AS `owning_project_id`,
			CASE
				WHEN `parent_project_id` IS NULL AND COALESCE(`repo_name`, '') <> '' THEN `repo_name`
				ELSE replace(`trimmed_path`, rtrim(`trimmed_path`, replace(`trimmed_path`, '/', '')), '')
			END AS `base_name`
		FROM (SELECT p.*, rtrim(p.`repo_path`, '/') AS `trimmed_path` FROM `projects` p) trimmed
		WHERE `kind` <> 'container'
			AND (`parent_project_id` IS NULL OR `parent_project_id` IN (SELECT `id` FROM `projects`))
	) named
);
--> statement-breakpoint
CREATE TABLE `workspace_repositories` (
	`workspace_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`branch` text NOT NULL,
	`head_sha` text,
	`upstream_owner` text,
	`upstream_repo` text,
	`upstream_branch` text,
	`pull_request_id` text,
	`suppressed_pull_request_id` text,
	PRIMARY KEY(`workspace_id`, `repository_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suppressed_pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workspace_repositories_repository_id_idx` ON `workspace_repositories` (`repository_id`);
--> statement-breakpoint
CREATE INDEX `workspace_repositories_pull_request_id_idx` ON `workspace_repositories` (`pull_request_id`);
--> statement-breakpoint
CREATE INDEX `workspace_repositories_upstream_ref_idx` ON `workspace_repositories` (`upstream_owner`,`upstream_repo`,`upstream_branch`);
--> statement-breakpoint
-- A workspace of a single-repo project checks out that project's repository.
INSERT INTO `workspace_repositories` (`workspace_id`, `repository_id`, `branch`, `head_sha`, `upstream_owner`, `upstream_repo`, `upstream_branch`, `pull_request_id`, `suppressed_pull_request_id`)
SELECT w.`id`, w.`project_id`, w.`branch`, w.`head_sha`, w.`upstream_owner`, w.`upstream_repo`, w.`upstream_branch`, w.`pull_request_id`, w.`suppressed_pull_request_id`
FROM `workspaces` w
JOIN `repositories` r ON r.`id` = w.`project_id`
WHERE w.`parent_workspace_id` IS NULL;
--> statement-breakpoint
-- A workspace made directly on a prototype child project now belongs to its parent.
UPDATE `workspaces`
SET `project_id` = (SELECT r.`project_id` FROM `repositories` r WHERE r.`id` = `workspaces`.`project_id`)
WHERE `parent_workspace_id` IS NULL
	AND `project_id` IN (SELECT r.`id` FROM `repositories` r WHERE r.`project_id` <> r.`id`);
--> statement-breakpoint
-- A prototype checkout row becomes a checkout of its parent workspace.
INSERT OR IGNORE INTO `workspace_repositories` (`workspace_id`, `repository_id`, `branch`, `head_sha`, `upstream_owner`, `upstream_repo`, `upstream_branch`, `pull_request_id`, `suppressed_pull_request_id`)
SELECT c.`parent_workspace_id`, c.`project_id`, c.`branch`, c.`head_sha`, c.`upstream_owner`, c.`upstream_repo`, c.`upstream_branch`, c.`pull_request_id`, c.`suppressed_pull_request_id`
FROM `workspaces` c
JOIN `repositories` r ON r.`id` = c.`project_id`
JOIN `workspaces` p ON p.`id` = c.`parent_workspace_id`;
--> statement-breakpoint
-- The prototype always put a checkout at root/<folder>. With one checkout the
-- new layout is the workspace folder itself, so point it at that checkout.
UPDATE `workspaces`
SET `worktree_path` = (
	SELECT c.`worktree_path` FROM `workspaces` c
	JOIN `workspace_repositories` wr ON wr.`workspace_id` = `workspaces`.`id` AND wr.`repository_id` = c.`project_id`
	WHERE c.`parent_workspace_id` = `workspaces`.`id`
)
WHERE `id` IN (SELECT DISTINCT `parent_workspace_id` FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL)
	AND (SELECT COUNT(*) FROM `workspace_repositories` wr WHERE wr.`workspace_id` = `workspaces`.`id`) = 1;
--> statement-breakpoint
UPDATE `terminal_sessions`
SET `origin_workspace_id` = (
	SELECT p.`id` FROM `workspaces` c JOIN `workspaces` p ON p.`id` = c.`parent_workspace_id`
	WHERE c.`id` = `terminal_sessions`.`origin_workspace_id`
)
WHERE `origin_workspace_id` IN (SELECT `id` FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL);
--> statement-breakpoint
UPDATE `terminal_agent_bindings`
SET `workspace_id` = (
	SELECT p.`id` FROM `workspaces` c JOIN `workspaces` p ON p.`id` = c.`parent_workspace_id`
	WHERE c.`id` = `terminal_agent_bindings`.`workspace_id`
)
WHERE `workspace_id` IN (
	SELECT c.`id` FROM `workspaces` c JOIN `workspaces` p ON p.`id` = c.`parent_workspace_id`
);
--> statement-breakpoint
DELETE FROM `terminal_agent_bindings` WHERE `workspace_id` IN (SELECT `id` FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO `workspace_pull_requests` (`workspace_id`, `pull_request_id`, `linked_at`)
SELECT p.`id`, wpr.`pull_request_id`, wpr.`linked_at`
FROM `workspace_pull_requests` wpr
JOIN `workspaces` c ON c.`id` = wpr.`workspace_id`
JOIN `workspaces` p ON p.`id` = c.`parent_workspace_id`;
--> statement-breakpoint
DELETE FROM `workspace_pull_requests` WHERE `workspace_id` IN (SELECT `id` FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `workspace_tags` WHERE `workspace_id` IN (SELECT `id` FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `mobile_last_devices` WHERE `workspace_id` IN (SELECT `id` FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `workspaces` WHERE `parent_workspace_id` IS NOT NULL;
--> statement-breakpoint
-- Workspaces whose project does not survive: a prototype container with no
-- repositories left (it cannot have a primary), or a child project left behind
-- by a purged container.
DELETE FROM `workspace_tags` WHERE `workspace_id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
DELETE FROM `workspace_pull_requests` WHERE `workspace_id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
DELETE FROM `mobile_last_devices` WHERE `workspace_id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
UPDATE `terminal_sessions` SET `origin_workspace_id` = NULL WHERE `origin_workspace_id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
DELETE FROM `terminal_agent_bindings` WHERE `workspace_id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
DELETE FROM `workspace_repositories` WHERE `workspace_id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
DELETE FROM `workspaces` WHERE `id` IN (SELECT w.`id` FROM `workspaces` w WHERE w.`project_id` IS NOT NULL AND w.`project_id` NOT IN (SELECT `id` FROM `projects` WHERE `parent_project_id` IS NULL AND (`kind` <> 'container' OR EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`))));
--> statement-breakpoint
DELETE FROM `tag_folder_settings` WHERE `scope` IN (SELECT p.`id` FROM `projects` p WHERE p.`kind` = 'container' AND NOT EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = p.`id`));
--> statement-breakpoint
DELETE FROM `projects` WHERE `kind` = 'container' AND NOT EXISTS (SELECT 1 FROM `repositories` r WHERE r.`project_id` = `projects`.`id`);
--> statement-breakpoint
CREATE TABLE `__new_pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`repo_provider` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`pr_number` integer NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	`head_branch` text NOT NULL,
	`head_sha` text NOT NULL,
	`review_decision` text,
	`checks_status` text DEFAULT 'none' NOT NULL,
	`checks_json` text DEFAULT '[]' NOT NULL,
	`merged_at` integer,
	`last_fetched_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_pull_requests` (`id`, `repository_id`, `repo_provider`, `repo_owner`, `repo_name`, `pr_number`, `url`, `title`, `state`, `is_draft`, `head_branch`, `head_sha`, `review_decision`, `checks_status`, `checks_json`, `merged_at`, `last_fetched_at`, `error`, `created_at`, `updated_at`)
SELECT `id`, `project_id`, `repo_provider`, `repo_owner`, `repo_name`, `pr_number`, `url`, `title`, `state`, `is_draft`, `head_branch`, `head_sha`, `review_decision`, `checks_status`, `checks_json`, `merged_at`, `last_fetched_at`, `error`, `created_at`, `updated_at`
FROM `pull_requests`
WHERE `project_id` IN (SELECT `id` FROM `repositories`);
--> statement-breakpoint
UPDATE `workspace_repositories` SET `pull_request_id` = NULL WHERE `pull_request_id` NOT IN (SELECT `id` FROM `__new_pull_requests`);
--> statement-breakpoint
UPDATE `workspace_repositories` SET `suppressed_pull_request_id` = NULL WHERE `suppressed_pull_request_id` NOT IN (SELECT `id` FROM `__new_pull_requests`);
--> statement-breakpoint
DELETE FROM `workspace_pull_requests` WHERE `pull_request_id` NOT IN (SELECT `id` FROM `__new_pull_requests`);
--> statement-breakpoint
DROP TABLE `pull_requests`;
--> statement-breakpoint
ALTER TABLE `__new_pull_requests` RENAME TO `pull_requests`;
--> statement-breakpoint
CREATE INDEX `pull_requests_repository_id_idx` ON `pull_requests` (`repository_id`);
--> statement-breakpoint
CREATE INDEX `pull_requests_repo_branch_idx` ON `pull_requests` (`repo_provider`,`repo_owner`,`repo_name`,`head_branch`);
--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_repo_pr_unique` ON `pull_requests` (`repo_provider`,`repo_owner`,`repo_name`,`pr_number`);
--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`primary_repository_id` text NOT NULL,
	`worktree_base_dir` text,
	`branch_prefix_mode` text,
	`branch_prefix_custom` text,
	`icon` text,
	`color` text,
	`naming_instructions` text,
	`name` text DEFAULT '' NOT NULL,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects` (`id`, `primary_repository_id`, `worktree_base_dir`, `branch_prefix_mode`, `branch_prefix_custom`, `icon`, `color`, `naming_instructions`, `name`, `deleted_at`, `deleted_by_user_id`, `updated_at`, `created_at`)
SELECT
	p.`id`,
	CASE
		WHEN p.`kind` = 'container' THEN (SELECT r.`id` FROM `repositories` r WHERE r.`project_id` = p.`id` ORDER BY r.`created_at`, r.`id` LIMIT 1)
		ELSE p.`id`
	END,
	p.`worktree_base_dir`, p.`branch_prefix_mode`, p.`branch_prefix_custom`, p.`icon`, p.`color`, p.`naming_instructions`, p.`name`, p.`deleted_at`, p.`deleted_by_user_id`, p.`updated_at`, p.`created_at`
FROM `projects` p
WHERE p.`parent_project_id` IS NULL;
--> statement-breakpoint
DROP TABLE `projects`;
--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;
--> statement-breakpoint
CREATE TABLE `__new_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`worktree_path` text NOT NULL,
	`branch` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'worktree' NOT NULL,
	`task_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`last_activity_at` integer,
	`archived_at` integer,
	`archive_reason` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workspaces` (`id`, `project_id`, `worktree_path`, `branch`, `name`, `type`, `task_id`, `created_by_user_id`, `created_at`, `updated_at`, `last_activity_at`, `archived_at`, `archive_reason`)
SELECT `id`, `project_id`, `worktree_path`, `branch`, `name`, `type`, `task_id`, `created_by_user_id`, `created_at`, `updated_at`, `last_activity_at`, `archived_at`, `archive_reason`
FROM `workspaces`;
--> statement-breakpoint
DROP TABLE `workspaces`;
--> statement-breakpoint
ALTER TABLE `__new_workspaces` RENAME TO `workspaces`;
--> statement-breakpoint
CREATE INDEX `workspaces_project_id_idx` ON `workspaces` (`project_id`);
--> statement-breakpoint
CREATE INDEX `workspaces_archived_at_idx` ON `workspaces` (`archived_at`);
