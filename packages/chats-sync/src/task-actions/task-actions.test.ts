import { describe, expect, test } from "bun:test";
import type { ChatState } from "@superset/chats-core";
import type { ApiTaskActivity, SyncSignal } from "../api-types/api-types.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { ApiError } from "../http/http.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";
import {
	apiMessage,
	apiTask,
	bootstrap,
} from "../test-fixtures/test-fixtures.ts";
import {
	applyTaskActivity,
	createTaskActions,
	optimisticTaskFields,
	watchTaskActivity,
} from "./task-actions.ts";

const DEV = "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

function setup(api: Partial<SyncApi>) {
	let state: ChatState | null = fromBootstrap(bootstrap());
	const failures: string[] = [];
	const actions = createTaskActions({
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

const activity = (id: string, at: string): ApiTaskActivity => ({
	id,
	taskId: "t1",
	kind: "progress",
	text: id,
	actor: { kind: "dev", id: "m-me" },
	at,
});

describe("task actions", () => {
	test("an edit shows at once and takes the server's copy", async () => {
		let release: () => void = () => {};
		const { actions, state } = setup({
			updateTask: (id, patch) =>
				new Promise(
					(resolve) =>
						(release = () =>
							resolve(
								apiTask({ id, title: patch.title!, description: "server" }),
							)),
				),
		});
		const saving = actions.update("t1", { title: "Pay the rent" });
		expect(state().tasks[0]).toMatchObject({
			title: "Pay the rent",
			description: "",
		});
		release();
		expect(await saving).toBe(true);
		expect(state().tasks[0]).toMatchObject({
			title: "Pay the rent",
			description: "server",
		});
	});

	test("a failed edit rolls back", async () => {
		const { actions, state, failures } = setup({
			updateTask: async () => Promise.reject(new Error("offline")),
		});
		expect(await actions.update("t1", { status: "in_progress" })).toBe(false);
		expect(state().tasks[0]?.status).toBe("todo");
		expect(failures).toEqual(["Couldn't update the task"]);
	});

	test("a task's saves go one at a time, and an answer doesn't hide a newer save still waiting", async () => {
		const sent: string[] = [];
		const answers: (() => void)[] = [];
		const { actions, state } = setup({
			updateTask: (id, patch) =>
				new Promise((resolve) => {
					sent.push(patch.title!);
					answers.push(() => resolve(apiTask({ id, title: patch.title! })));
				}),
		});
		const first = actions.update("t1", { title: "Buy" });
		const second = actions.update("t1", { title: "Buy a costume" });
		await Promise.resolve();
		expect(sent).toEqual(["Buy"]);
		answers[0]!();
		expect(await first).toBe(true);
		expect(state().tasks[0]?.title).toBe("Buy a costume");
		expect(sent).toEqual(["Buy", "Buy a costume"]);
		answers[1]!();
		expect(await second).toBe(true);
		expect(state().tasks[0]?.title).toBe("Buy a costume");
	});

	test("a failed save puts back only its own fields", async () => {
		const { actions, state } = setup({
			updateTask: async (id, patch) =>
				patch.title
					? Promise.reject(new Error("offline"))
					: apiTask({ id, description: patch.description! }),
		});
		const title = actions.update("t1", { title: "Lost" });
		const description = actions.update("t1", { description: "- [x] kept" });
		expect(await title).toBe(false);
		expect(state().tasks[0]).toMatchObject({
			title: "Pay rent",
			description: "- [x] kept",
		});
		expect(await description).toBe(true);
	});

	test("delete is optimistic; a 404 means it's already gone, anything else puts it back", async () => {
		const gone = setup({
			deleteTask: async () =>
				Promise.reject(new ApiError(404, "not_found", "Task not found")),
		});
		expect(await gone.actions.remove("t1")).toBe(true);
		expect(gone.state().tasks).toEqual([]);

		const offline = setup({
			deleteTask: async () => Promise.reject(new Error("offline")),
		});
		expect(await offline.actions.remove("t1", { series: true })).toBe(false);
		expect(offline.state().tasks.map((t) => t.id)).toEqual(["t1"]);
	});

	test("create waits for the server and adds the task with its card", async () => {
		let sent: unknown;
		const { actions, state } = setup({
			createTask: async (groupId, body) => {
				sent = body;
				return {
					message: apiMessage({ id: "m-new", taskId: "t-new", groupId }),
					task: apiTask({ id: "t-new", groupId, title: body.title }),
				};
			},
		});
		const form = {
			title: "Research shoes",
			description: "Under €150",
			assignee: `<@dev:${DEV}>`,
			due: null,
			scheduledAt: null,
			remind: false,
			repeat: null,
		};
		expect(await actions.create("g-me", form)).toBe("t-new");
		expect(sent).toMatchObject({
			...form,
			clientId: expect.stringMatching(/^local-/),
		});
		expect(state().tasks.map((t) => t.id)).toContain("t-new");
		expect(state().messages.some((m) => m.id === "m-new")).toBe(true);
	});
});

describe("optimisticTaskFields", () => {
	test("a mention token assigns; null unassigns; a time clears the date; a repeat waits for the server", () => {
		expect(optimisticTaskFields({ assignee: `<@dev:${DEV}>` })).toEqual({
			assigneeId: null,
			assigneeDevId: DEV,
		});
		expect(optimisticTaskFields({ assignee: null })).toEqual({
			assigneeId: null,
			assigneeDevId: null,
		});
		expect(
			optimisticTaskFields({
				scheduledAt: "2026-10-12T09:00:00.000Z",
				repeat: {
					rrule: "FREQ=DAILY",
					timezone: "UTC",
					dtstart: "2026-10-12T09:00:00.000Z",
				},
			}),
		).toEqual({
			scheduledAt: "2026-10-12T09:00:00.000Z",
			due: null,
		});
	});
});

describe("watchTaskActivity", () => {
	test("keeps entries heard while loading, follows events, reloads after a bootstrap, and stops", async () => {
		let listener: (s: SyncSignal) => void = () => {};
		let unsubscribed = false;
		const subscribe = (l: (s: SyncSignal) => void) => {
			listener = l;
			return () => {
				unsubscribed = true;
			};
		};
		let server = [activity("a", "2026-10-12T09:00:00.000Z")];
		let release: () => void = () => {};
		const actions = {
			activity: () =>
				new Promise<ApiTaskActivity[]>(
					(resolve) => (release = () => resolve(server)),
				),
		};
		const seen: [string[], boolean][] = [];
		const watch = watchTaskActivity("t1", actions, subscribe, (list, loaded) =>
			seen.push([list.map((a) => a.id), loaded]),
		);

		listener({
			type: "event",
			at: 0,
			event: {
				type: "task.activity",
				groupId: "g-me",
				activity: activity("b", "2026-10-12T09:01:00.000Z"),
			},
		});
		release();
		await Bun.sleep(0);
		expect(seen.at(-1)).toEqual([["a", "b"], true]);

		watch.add(activity("c", "2026-10-12T09:02:00.000Z"));
		expect(seen.at(-1)).toEqual([["a", "b", "c"], true]);

		server = [
			activity("a", "2026-10-12T09:00:00.000Z"),
			activity("d", "2026-10-12T09:03:00.000Z"),
		];
		listener({ type: "bootstrapped", devs: [], requestedAt: 0 });
		release();
		await Bun.sleep(0);
		expect(seen.at(-1)?.[0]).toEqual(["a", "b", "c", "d"]);

		watch.stop();
		expect(unsubscribed).toBe(true);
	});
});

describe("applyTaskActivity", () => {
	test("adds this task's new entries once, in time order", () => {
		const list = [
			activity("a", "2026-10-12T09:00:00.000Z"),
			activity("c", "2026-10-12T09:02:00.000Z"),
		];
		const b = activity("b", "2026-10-12T09:01:00.000Z");
		const next = applyTaskActivity(list, "t1", {
			type: "task.activity",
			groupId: "g-me",
			activity: b,
		});
		expect(next.map((a) => a.id)).toEqual(["a", "b", "c"]);
		expect(
			applyTaskActivity(next, "t1", {
				type: "task.activity",
				groupId: "g-me",
				activity: b,
			}),
		).toBe(next);
		expect(
			applyTaskActivity(list, "t2", {
				type: "task.activity",
				groupId: "g-me",
				activity: b,
			}),
		).toBe(list);
	});
});
