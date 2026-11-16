import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Task } from "../model/model.ts";
import { taskWaitingLabel } from "../questions/questions.ts";
import {
	type TaskAssignee,
	taskAssignee,
} from "../task-assignees/task-assignees.ts";
import { isDone, TASK_STATUS_LABEL } from "../task-status/task-status.ts";

/** What a task's card in the chat says besides its title and time; both apps draw it from this. */
export interface TaskCardInfo {
	done: boolean;
	/** "Waiting for your answer", "In progress"; null for to do and done, which the ring already says. */
	status: string | null;
	/** Its Dev waits on someone's answer to a question about it. */
	waiting: boolean;
	/** A Dev has it in progress: the card shows it working. */
	working: boolean;
	assignee: TaskAssignee | null;
}

export function taskCardInfo(state: ChatState, task: Task): TaskCardInfo {
	const assignee = taskAssignee(state, task);
	const waiting = taskWaitingLabel(state, task.id);
	const status =
		waiting ??
		(task.status === "in_progress" ? TASK_STATUS_LABEL[task.status] : null);
	return {
		done: isDone(task),
		status,
		waiting: waiting !== null,
		working:
			!waiting && task.status === "in_progress" && assignee?.kind === "dev",
		assignee,
	};
}

/**
 * A Dev's note to itself: a task it made and gave itself (a follow-up, "check for Sam's reply at 5"). The chat sees
 * it as one slim line, not a full card.
 */
export function isOwnFollowUp(
	message: Pick<Message, "authorDevId">,
	task: Pick<Task, "assigneeDevId">,
): boolean {
	return !!message.authorDevId && message.authorDevId === task.assigneeDevId;
}

/** What the tab under a Dev's message says, folded, about the tasks its turn made (see `toThreadItems`' `tasks`). */
export interface TaskTabInfo {
	count: number;
	done: number;
	/** One task: "Follow-up" when the Dev gave it itself, else its title. Several: "4 tasks". */
	label: string;
}

export function taskTabInfo(
	message: Pick<Message, "authorDevId">,
	tasks: Task[],
): TaskTabInfo {
	const only = tasks.length === 1 ? tasks[0]! : null;
	return {
		count: tasks.length,
		done: tasks.filter(isDone).length,
		label: only
			? isOwnFollowUp(message, only)
				? "Follow-up"
				: only.title
			: `${tasks.length} tasks`,
	};
}
