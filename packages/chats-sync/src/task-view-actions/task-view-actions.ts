import type {
	ChatState,
	SavedTaskView,
	TaskViewSpec,
} from "@superset/chats-core";
import type { ApiTaskView } from "../api-types/api-types.ts";
import { toTaskView } from "../from-api/from-api.ts";
import { retryOnNetworkError } from "../http/http.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";

interface Deps {
	api: Pick<SyncApi, "createTaskView" | "updateTaskView" | "deleteTaskView">;
	getState: () => ChatState | null;
	update: (change: (s: ChatState) => ChatState) => void;
	/** Shows a toast (or signs out on 401). */
	fail: (title: string, err: unknown) => void;
	/** Waits before each quiet repeat of a change that got no answer (see `retryOnNetworkError`). */
	retryDelaysMs?: number[];
}

const withViews =
	(views: ApiTaskView[]) =>
	(s: ChatState): ChatState => ({ ...s, taskViews: views.map(toTaskView) });
const setViews =
	(views: SavedTaskView[]) =>
	(s: ChatState): ChatState => ({ ...s, taskViews: views });

/**
 * Saved task views, kept on the server so both apps (and every device) have the same ones. Renames, saves and deletes
 * apply at once and roll back with a toast; a new view waits for the server, which gives its id. Every answer is the
 * whole list, which the person's other devices hear as `task_views.changed`.
 */
export function createTaskViewActions({
	api,
	getState,
	update,
	fail,
	retryDelaysMs,
}: Deps) {
	async function change(
		failTitle: string,
		optimistic: (views: SavedTaskView[]) => SavedTaskView[],
		send: () => Promise<{ views: ApiTaskView[] }>,
		repeatable = true,
	) {
		const before = getState()?.taskViews ?? [];
		update(setViews(optimistic(before)));
		try {
			update(
				withViews(
					(
						await (repeatable
							? retryOnNetworkError(send, retryDelaysMs)
							: send())
					).views,
				),
			);
			return true;
		} catch (err) {
			update(setViews(before));
			fail(failTitle, err);
			return false;
		}
	}

	return {
		/** Resolves to the new view's id, or null after a toast. */
		async createView(name: string, spec: TaskViewSpec) {
			try {
				const created = await api.createTaskView(name, spec);
				update(withViews(created.views));
				return created.id;
			} catch (err) {
				fail("Couldn't save the view", err);
				return null;
			}
		},

		renameView: (id: string, name: string) =>
			change(
				"Couldn't rename the view",
				(vs) => vs.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)),
				() => api.updateTaskView(id, { name }),
			),

		/** "Save": the view takes the spec on screen. */
		saveView: (id: string, spec: TaskViewSpec) =>
			change(
				"Couldn't save the view",
				(vs) => vs.map((v) => (v.id === id ? { ...v, ...spec } : v)),
				() => api.updateTaskView(id, { spec }),
			),

		deleteView: (id: string) =>
			change(
				"Couldn't delete the view",
				(vs) => vs.filter((v) => v.id !== id),
				() => api.deleteTaskView(id),
				false,
			),
	};
}

export type TaskViewActions = ReturnType<typeof createTaskViewActions>;
