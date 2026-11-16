import {
	type ChatState,
	parseMentionTokens,
	type Task,
} from "@superset/chats-core";
import type {
	ApiTaskActivity,
	RealtimeEvent,
	SyncSignal,
	TaskForm,
	TaskPatch,
} from "../api-types/api-types.ts";
import {
	applyEvent,
	applySentMessage,
	removeTask,
	upsertTask,
} from "../apply-event/apply-event.ts";
import { ApiError, retryOnNetworkError } from "../http/http.ts";
import { newClientId, setTaskFields } from "../optimistic/optimistic.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";

interface Deps {
	api: Pick<
		SyncApi,
		| "createTask"
		| "updateTask"
		| "deleteTask"
		| "startTask"
		| "commentOnTask"
		| "taskActivity"
	>;
	getState: () => ChatState | null;
	update: (change: (s: ChatState) => ChatState) => void;
	/** Shows an error (or signs out on 401). */
	fail: (title: string, err: unknown) => void;
	/** Waits before each quiet repeat of an edit or delete that got no answer (see `retryOnNetworkError`). */
	retryDelaysMs?: number[];
}

/**
 * What a patch changes on the task as shown, before the server answers. A repeat is worded and scheduled by the server,
 * so it only shows once confirmed; an assignee shows when it's a mention token (what the pickers send).
 */
export function optimisticTaskFields(patch: TaskPatch): Partial<Task> {
	const { assignee, repeat: _repeat, ...rest } = patch;
	const fields: Partial<Task> = { ...rest };
	if (assignee === null)
		Object.assign(fields, { assigneeId: null, assigneeDevId: null });
	const [ref] = assignee ? parseMentionTokens(assignee) : [];
	if (ref)
		Object.assign(
			fields,
			ref.kind === "dev"
				? { assigneeId: null, assigneeDevId: ref.id }
				: { assigneeId: ref.id, assigneeDevId: null },
		);
	if (fields.scheduledAt) fields.due = null;
	return fields;
}

/** A task's activity with one realtime event applied: a new entry for this task is added once, in time order. */
export function applyTaskActivity(
	list: ApiTaskActivity[],
	taskId: string,
	event: RealtimeEvent,
): ApiTaskActivity[] {
	if (
		event.type !== "task.activity" ||
		event.activity.taskId !== taskId ||
		list.some((a) => a.id === event.activity.id)
	)
		return list;
	return [...list, event.activity].sort((a, b) => a.at.localeCompare(b.at));
}

const asEvent = (activity: ApiTaskActivity): RealtimeEvent => ({
	type: "task.activity",
	groupId: "",
	activity,
});

/**
 * A task's activity for an open detail view: loaded, then kept live from the store's signals. Entries heard while it
 * loads are kept; a fresh bootstrap (the realtime log ran out) loads it again, since events in between weren't heard.
 * `add` shows an entry this client made (its comment) without waiting for the echo; `stop` ends it.
 */
export function watchTaskActivity(
	taskId: string,
	actions: Pick<TaskActions, "activity">,
	subscribe: (listener: (signal: SyncSignal) => void) => () => void,
	onChange: (list: ApiTaskActivity[], loaded: boolean) => void,
) {
	let list: ApiTaskActivity[] = [];
	let loaded = false;
	let stopped = false;
	const set = (next: ApiTaskActivity[]) => {
		if (next === list || stopped) return;
		list = next;
		onChange(list, loaded);
	};
	const load = () =>
		void actions.activity(taskId).then((fetched) => {
			if (stopped) return;
			loaded = true;
			list = list.reduce(
				(l, a) => applyTaskActivity(l, taskId, asEvent(a)),
				fetched,
			);
			onChange(list, loaded);
		});
	const unsubscribe = subscribe((signal) => {
		if (signal.type === "bootstrapped") load();
		else if (signal.type === "event")
			set(applyTaskActivity(list, taskId, signal.event));
	});
	load();
	return {
		add: (entry: ApiTaskActivity) =>
			set(applyTaskActivity(list, taskId, asEvent(entry))),
		stop: () => {
			stopped = true;
			unsubscribe();
		},
	};
}

/**
 * Tasks beyond ticking them (chat-actions): the new-task form, edits, Start, delete, comments and activity. Edits and
 * deletes show at once and roll back with an error; creating waits for the server, which posts the task's card in its
 * chat. Each resolves to whether it worked (or the new task's id), so a form can stay open on failure.
 */
export function createTaskActions({
	api,
	getState,
	update,
	fail,
	retryDelaysMs,
}: Deps) {
	const taskOf = (taskId: string) =>
		getState()?.tasks.find((t) => t.id === taskId);
	// Per task: the last patch in line, and the optimistic fields of those not yet answered.
	const chains = new Map<string, Promise<boolean>>();
	const pending = new Map<string, { fields: Partial<Task> }[]>();

	return {
		async create(chatId: string, form: TaskForm): Promise<string | null> {
			// One clientId for every repeat: the server returns the task it already made for it.
			const clientId = newClientId();
			try {
				const sent = await retryOnNetworkError(
					() => api.createTask(chatId, { ...form, clientId }),
					retryDelaysMs,
				);
				update((s) => applySentMessage(s, sent));
				return sent.task?.id ?? null;
			} catch (err) {
				fail("Couldn't add the task", err);
				return null;
			}
		},

		/**
		 * A per-field patch, shown at once. A task's patches go to the server one at a time, in order, so a page saving as
		 * you type never has an older save land after a newer one; the server's copy of each is shown with the patches
		 * still waiting laid over it. A failed patch puts back only the fields it changed.
		 */
		update(taskId: string, patch: TaskPatch): Promise<boolean> {
			const before = taskOf(taskId);
			if (!before) return Promise.resolve(false);
			const fields = optimisticTaskFields(patch);
			update((s) => setTaskFields(s, taskId, fields));
			const queue = pending.get(taskId) ?? [];
			const entry = { fields };
			pending.set(taskId, [...queue, entry]);
			const waiting = () =>
				pending.get(taskId)?.filter((e) => e !== entry) ?? [];
			const settle = (change: (s: ChatState) => ChatState) =>
				update((s) =>
					waiting().reduce(
						(next, e) => setTaskFields(next, taskId, e.fields),
						change(s),
					),
				);
			const send = async () => {
				try {
					const synced = await retryOnNetworkError(
						() => api.updateTask(taskId, patch),
						retryDelaysMs,
					);
					settle((s) => applyEvent(s, { type: "task.updated", task: synced }));
					return true;
				} catch (err) {
					const undo = Object.fromEntries(
						Object.keys(fields).map((key) => [key, before[key as keyof Task]]),
					);
					settle((s) => setTaskFields(s, taskId, undo));
					fail("Couldn't update the task", err);
					return false;
				} finally {
					const rest = waiting();
					if (rest.length) pending.set(taskId, rest);
					else pending.delete(taskId);
				}
			};
			const ahead = chains.get(taskId);
			const run = ahead ? ahead.then(send) : send();
			chains.set(taskId, run);
			void run.then(() => chains.get(taskId) === run && chains.delete(taskId));
			return run;
		},

		/** `series`: stop the repeat too; without it, deleting a repeat's upcoming task skips that occurrence. */
		async remove(
			taskId: string,
			opts: { series?: boolean } = {},
		): Promise<boolean> {
			const before = taskOf(taskId);
			if (!before) return false;
			update((s) => removeTask(s, taskId));
			try {
				await retryOnNetworkError(
					() => api.deleteTask(taskId, opts),
					retryDelaysMs,
				);
				return true;
			} catch (err) {
				// Someone else deleted it first: the outcome the user wanted.
				if (err instanceof ApiError && err.status === 404) return true;
				update((s) => upsertTask(s, before));
				fail("Couldn't delete the task", err);
				return false;
			}
		},

		async start(taskId: string): Promise<boolean> {
			try {
				const synced = await api.startTask(taskId);
				update((s) => applyEvent(s, { type: "task.updated", task: synced }));
				return true;
			} catch (err) {
				fail("Couldn't start the task", err);
				return false;
			}
		},

		async comment(
			taskId: string,
			text: string,
		): Promise<ApiTaskActivity | null> {
			try {
				return (await api.commentOnTask(taskId, text)).activity;
			} catch (err) {
				fail("Couldn't add the comment", err);
				return null;
			}
		},

		async activity(taskId: string): Promise<ApiTaskActivity[]> {
			try {
				return (
					await retryOnNetworkError(
						() => api.taskActivity(taskId),
						retryDelaysMs,
					)
				).activity;
			} catch (err) {
				fail("Couldn't load the task's activity", err);
				return [];
			}
		},
	};
}

export type TaskActions = ReturnType<typeof createTaskActions>;
