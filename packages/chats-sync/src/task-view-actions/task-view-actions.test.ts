import { describe, expect, test } from "bun:test";
import {
	ALL_TASKS_VIEW,
	type ChatState,
	type TaskViewSpec,
} from "@superset/chats-core";
import type { ApiTaskView } from "../api-types/api-types.ts";
import { applyEvent } from "../apply-event/apply-event.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { ApiError } from "../http/http.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";
import { bootstrap } from "../test-fixtures/test-fixtures.ts";
import { createTaskViewActions } from "./task-view-actions.ts";

const board: TaskViewSpec = { ...ALL_TASKS_VIEW, layout: "board" };
const view = (
	id: string,
	name: string,
	spec: TaskViewSpec = ALL_TASKS_VIEW,
): ApiTaskView => ({ id, name, spec });

function setup(api: Partial<SyncApi>, views: ApiTaskView[] = []) {
	let state: ChatState | null = fromBootstrap({
		...bootstrap(),
		taskViews: views,
	});
	const failures: string[] = [];
	const actions = createTaskViewActions({
		api: api as SyncApi,
		getState: () => state,
		update: (change) => {
			state = change(state!);
		},
		fail: (title) => void failures.push(title),
		retryDelaysMs: [0, 0],
	});
	return { actions, state: () => state!, failures };
}

describe("saved task views", () => {
	test("the bootstrap's views are in the state, specs read as stored ones are", () => {
		const { state } = setup({}, [view("v1", "Board", board)]);
		expect(state().taskViews).toEqual([{ id: "v1", name: "Board", ...board }]);
	});

	test("a new view takes the server's list and resolves to its id", async () => {
		const { actions, state } = setup({
			createTaskView: async (name, spec) => ({
				id: "v1",
				views: [view("v1", name, spec)],
			}),
		});
		expect(await actions.createView("Board", board)).toBe("v1");
		expect(state().taskViews).toEqual([{ id: "v1", name: "Board", ...board }]);
	});

	test("a rename shows at once and rolls back with a toast when the server says no", async () => {
		let refuse: (err: Error) => void = () => {};
		const { actions, state, failures } = setup(
			{ updateTaskView: () => new Promise((_, reject) => (refuse = reject)) },
			[view("v1", "Board")],
		);
		const renaming = actions.renameView("v1", "Columns");
		expect(state().taskViews![0]!.name).toBe("Columns");
		refuse(new ApiError(400, "invalid", "no"));
		expect(await renaming).toBe(false);
		expect(state().taskViews![0]!.name).toBe("Board");
		expect(failures).toEqual(["Couldn't rename the view"]);
	});

	test("saving and deleting apply at once, then take the server's list", async () => {
		const { actions, state } = setup(
			{
				updateTaskView: async (id, patch) => ({
					views: [view(id, "Board", patch.spec)],
				}),
				deleteTaskView: async () => ({ views: [] }),
			},
			[view("v1", "Board")],
		);
		expect(await actions.saveView("v1", board)).toBe(true);
		expect(state().taskViews![0]).toMatchObject({ layout: "board" });
		expect(await actions.deleteView("v1")).toBe(true);
		expect(state().taskViews).toEqual([]);
	});

	test("another device's change replaces the list", () => {
		const { state } = setup({}, [view("v1", "Board")]);
		const next = applyEvent(state(), {
			type: "task_views.changed",
			views: [view("v2", "Mine")],
		});
		expect(next.taskViews).toEqual([
			{ id: "v2", name: "Mine", ...ALL_TASKS_VIEW },
		]);
	});

	test("a rename repeats quietly when the connection drops, a delete is not repeated", async () => {
		let renames = 0;
		let deletes = 0;
		const { actions, state, failures } = setup(
			{
				updateTaskView: async (id, patch) => {
					if (++renames < 3) throw new TypeError("timed out");
					return { views: [view(id, patch.name!)] };
				},
				deleteTaskView: async () => {
					deletes++;
					throw new TypeError("timed out");
				},
			},
			[view("v1", "Board", board)],
		);
		expect(await actions.renameView("v1", "Mine")).toBe(true);
		expect(renames).toBe(3);
		expect(failures).toEqual([]);
		expect(await actions.deleteView("v1")).toBe(false);
		expect(deletes).toBe(1);
		expect(state().taskViews).toHaveLength(1);
	});
});
