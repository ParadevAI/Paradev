import { describe, expect, test } from "bun:test";
import { reduce, withRead } from "@superset/chats-core";
import { fromBootstrap } from "../from-api/from-api.ts";
import { apiMessage, bootstrap } from "../test-fixtures/test-fixtures.ts";
import {
	createAppOptimistic,
	localNoteId,
	localTaskId,
	mergeRefresh,
	newClientId,
	restoreApp,
	rollbackCreateApp,
	rollbackSend,
	sendFileOptimistic,
	sendOptimistic,
	setChatDev,
	setDevFields,
	setTaskFields,
} from "./optimistic.ts";

const base = () => fromBootstrap(bootstrap());
const now = new Date(2026, 9, 10, 10, 0);
const noopEnv = { now: () => now, id: () => "unused" };

test("client ids are local", () => {
	expect(newClientId()).toMatch(/^local-[0-9a-f-]{36}$/);
});

describe("send", () => {
	test("shows the message under its clientId, with a local task for /task", () => {
		const state = sendOptimistic(base(), {
			chatId: "g-me",
			text: "/task Call mom tomorrow",
			clientId: "local-1",
			now,
		});
		const message = state.messages.at(-1)!;
		expect(message).toMatchObject({
			id: "local-1",
			authorId: "u1",
			taskId: localTaskId("local-1"),
		});
		expect(state.tasks.at(-1)).toMatchObject({
			id: localTaskId("local-1"),
			title: "Call mom",
			due: "2026-10-11",
		});
	});

	test("rollback removes exactly what the send added", () => {
		const start = base();
		const sent = sendOptimistic(start, {
			chatId: "g-me",
			text: "/task Call mom",
			clientId: "local-1",
			now,
		});
		expect(rollbackSend(sent, "local-1")).toEqual(start);
	});
});

test("a failed toggle is rolled back to the previous status", () => {
	const start = base();
	const toggled = reduce(start, { type: "toggle-task", taskId: "t1" }, noopEnv);
	expect(toggled.tasks[0]?.status).toBe("done");
	expect(setTaskFields(toggled, "t1", { status: "todo" })).toEqual(start);
});

describe("apps", () => {
	test("create shows the app with a local note; rollback removes both", () => {
		const start = base();
		const created = createAppOptimistic(start, {
			appId: "a1",
			chatId: "g-me",
			name: "Budget",
			description: "",
			now,
		});
		expect(created.apps.map((a) => a.id)).toEqual(["a1"]);
		expect(created.messages.at(-1)?.id).toBe(localNoteId("a1"));
		expect(rollbackCreateApp(created, "a1")).toEqual(start);
	});

	test("a failed delete restores the app in creation order", () => {
		let state = createAppOptimistic(base(), {
			appId: "a1",
			chatId: "g-me",
			name: "One",
			description: "",
			now,
		});
		state = createAppOptimistic(state, {
			appId: "a2",
			chatId: "g-me",
			name: "Two",
			description: "",
			now: new Date(now.getTime() + 60_000),
		});
		const removed = state.apps[0]!;
		const deleted = reduce(state, { type: "delete-app", appId: "a1" }, noopEnv);
		expect(restoreApp(deleted, removed).apps.map((a) => a.id)).toEqual([
			"a1",
			"a2",
		]);
		expect(restoreApp(state, removed)).toBe(state);
	});
});

describe("mergeRefresh", () => {
	test("keeps a read this client made while the bootstrap was on its way, unless the bootstrap's is further", () => {
		const read = (messageId: string, messageAt: string) => ({
			groupId: "g-me",
			userId: "u1",
			devId: null,
			messageId,
			messageAt,
			at: messageAt,
		});
		const local = withRead(base(), {
			chatId: "g-me",
			reader: { kind: "person", id: "u1" },
			messageId: "m2",
			messageAt: "2026-10-10T09:05:00.000Z",
			at: "2026-10-10T09:06:00.000Z",
		});
		const older = fromBootstrap(
			bootstrap({ reads: [read("m1", "2026-10-10T09:00:00.000Z")] }),
		);
		expect(
			mergeRefresh(local, older, new Set()).reads?.map((r) => r.messageId),
		).toEqual(["m2"]);
		const newer = fromBootstrap(
			bootstrap({ reads: [read("m3", "2026-10-10T09:09:00.000Z")] }),
		);
		expect(
			mergeRefresh(local, newer, new Set()).reads?.map((r) => r.messageId),
		).toEqual(["m3"]);
	});

	test("keeps unconfirmed sends and drops confirmed ones", () => {
		let local = sendOptimistic(base(), {
			chatId: "g-me",
			text: "/task Pending",
			clientId: "local-p",
			now,
		});
		local = sendOptimistic(local, {
			chatId: "g-me",
			text: "Confirmed",
			clientId: "local-c",
			now,
		});
		const fresh = fromBootstrap(
			bootstrap({
				messages: [
					apiMessage({ id: "m-c", clientId: "local-c", text: "Confirmed" }),
				],
			}),
		);

		const merged = mergeRefresh(local, fresh, new Set(["local-c"]));
		expect(merged.messages.map((m) => m.id)).toEqual(["m-c", "local-p"]);
		expect(merged.tasks.map((t) => t.id)).toEqual([
			"t1",
			localTaskId("local-p"),
		]);
	});

	test("keeps an app still being created, but not once the server has it", () => {
		const local = createAppOptimistic(base(), {
			appId: "a1",
			chatId: "g-me",
			name: "Budget",
			description: "",
			now,
		});
		const fresh = base();
		expect(mergeRefresh(local, fresh, new Set()).apps.map((a) => a.id)).toEqual(
			["a1"],
		);

		const freshWithApp = { ...fresh, apps: local.apps };
		const merged = mergeRefresh(local, freshWithApp, new Set());
		expect(merged.messages.some((m) => m.id === localNoteId("a1"))).toBe(false);
	});
});

describe("groups and Devs", () => {
	test("toggling a Dev into a chat and back restores the chat", () => {
		const start = base();
		const added = setChatDev(start, "g-trip", "m-me", true);
		expect(added.chats.find((c) => c.id === "g-trip")?.devIds).toEqual([
			"m-trip",
			"m-me",
		]);
		expect(setChatDev(added, "g-trip", "m-me", true)).toEqual(added);
		expect(setChatDev(added, "g-trip", "m-me", false)).toEqual(start);
	});

	test("Dev edits roll back to the previous values", () => {
		const start = base();
		const renamed = setDevFields(start, "m-me", {
			name: "Juno",
			color: "#000000",
		});
		expect(renamed.devs["m-me"]).toMatchObject({
			name: "Juno",
			color: "#000000",
		});
		expect(
			setDevFields(renamed, "m-me", { name: "Juniper", color: "#F2B23E" }),
		).toEqual(start);
		expect(setDevFields(start, "nope", { name: "x" })).toBe(start);
	});
});

describe("sending a file", () => {
	test("a file still going up, or failed, stays through a refresh; one the server has is dropped for its copy", () => {
		const sending = sendFileOptimistic(base(), {
			chatId: "g-me",
			clientId: "local-f1",
			name: "a.png",
			size: 3,
			now,
		});
		const failed = sendFileOptimistic(sending, {
			chatId: "g-me",
			clientId: "local-f2",
			name: "b.png",
			size: 3,
			now,
		});
		const fresh = base();
		expect(
			mergeRefresh(failed, fresh, new Set())
				.messages.map((m) => m.id)
				.slice(-2),
		).toEqual(["local-f1", "local-f2"]);
		expect(
			mergeRefresh(failed, fresh, new Set(["local-f1"]))
				.messages.map((m) => m.id)
				.at(-1),
		).toBe("local-f2");
	});

	test("a picture this device sent keeps its own copy through a refresh, once the server has it", () => {
		const fresh = base();
		const sent = fresh.messages.at(-1)!;
		const local = {
			...fresh,
			messages: fresh.messages.map((m) =>
				m.id === sent.id ? { ...m, localUri: "blob:mine" } : m,
			),
		};
		const merged = mergeRefresh(local, fresh, new Set());
		expect(merged.messages.find((m) => m.id === sent.id)?.localUri).toBe(
			"blob:mine",
		);
		expect(merged.messages.filter((m) => m.localUri)).toHaveLength(1);
	});

	test("a file sent to a chat this device doesn't have shows nowhere", () => {
		const start = base();
		expect(
			sendFileOptimistic(start, {
				chatId: "g-gone",
				clientId: "local-f1",
				name: "a.png",
				size: 3,
				now,
			}),
		).toBe(start);
	});
});
