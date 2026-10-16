import type { TaskWithStatus } from "../TasksView/hooks/useTasksTable";

export type RunnableTask = Pick<
	TaskWithStatus,
	"id" | "slug" | "title" | "description" | "branch"
> & {
	/** False for work that is not a task of ours: the workspace is then linked to no task. */
	linked?: false;
};
