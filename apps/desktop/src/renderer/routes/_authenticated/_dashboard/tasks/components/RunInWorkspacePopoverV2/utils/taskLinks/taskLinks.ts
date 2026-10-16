import type { RunnableTask } from "../../types";

export function cloudTaskLink(task: RunnableTask): { taskIds?: string[] } {
	return task.linked === false ? {} : { taskIds: [task.id] };
}

export function localTaskLink(task: RunnableTask): { taskId?: string } {
	return task.linked === false ? {} : { taskId: task.id };
}
