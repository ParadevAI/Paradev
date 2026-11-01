-- Each channel with tasks gets a project named after it; the channel's tasks move into it.
WITH linked AS MATERIALIZED (
	SELECT c.id AS channel_id, c.organization_id, c.name, c.visibility, gen_random_uuid() AS project_id
	FROM channels c
	WHERE c.task_project_id IS NULL
		AND EXISTS (SELECT 1 FROM channel_tasks ct WHERE ct.channel_id = c.id)
), created AS (
	INSERT INTO task_projects (id, organization_id, name)
	SELECT project_id, organization_id,
		CASE WHEN visibility = 'private' THEN 'Channel tasks' ELSE upper(left(name, 1)) || substr(name, 2) END
	FROM linked
	RETURNING id
)
UPDATE channels c SET task_project_id = l.project_id
FROM linked l
WHERE c.id = l.channel_id;
--> statement-breakpoint
INSERT INTO task_project_tasks (project_id, task_id, created_at)
SELECT c.task_project_id, ct.task_id, ct.created_at
FROM channel_tasks ct
JOIN channels c ON c.id = ct.channel_id
WHERE c.task_project_id IS NOT NULL
ON CONFLICT (task_id) DO NOTHING;
