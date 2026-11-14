import { afterEach, describe, expect, test } from "bun:test";
import type { DurableEnvelope } from "@superset/chat/protocol";
import { type ChatRuntime, chatSyncState } from "@superset/chat-runtime";
import { createTestRuntime } from "@superset/chat-runtime/testing";
import type { ApiClient } from "../types";
import { createChatSync } from "./chatSync";

const CHAT = "00000000-0000-4000-8000-000000000001";
const OTHER_CHAT = "00000000-0000-4000-8000-000000000002";
const WORKSPACE = "00000000-0000-4000-8000-0000000000aa";

type PushInput = {
	sessionId: string;
	workspaceId: string;
	events: { seq: number }[];
};

const runtimes: ChatRuntime[] = [];

afterEach(async () => {
	await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

function setup(
	options: {
		reject?: (input: PushInput) => boolean;
		rejectCode?: string;
		harnessSessionId?: string;
	} = {},
) {
	const reject = options.reject ?? (() => false);
	const appended: DurableEnvelope[] = [];
	const runtime = createTestRuntime({ onAppend: (e) => appended.push(e) });
	runtimes.push(runtime);
	const pushes: PushInput[] = [];
	const api = {
		chatHistory: {
			push: {
				mutate: async (input: PushInput) => {
					if (reject(input)) {
						throw Object.assign(new Error("rejected"), {
							data: { code: options.rejectCode ?? "BAD_REQUEST" },
						});
					}
					pushes.push(input);
					return { ackedSeq: input.events.at(-1)?.seq ?? 0 };
				},
			},
		},
	} as unknown as ApiClient;
	const timers: (() => void)[] = [];
	const sync = createChatSync({
		runtime: () => runtime,
		api,
		schedule: (run) => {
			timers.push(run);
			return () => {};
		},
	});
	const open = (sessionId: string) =>
		runtime.journal.open({
			sessionId,
			scopeId: WORKSPACE,
			harness: "fake",
			harnessSessionId: options.harnessSessionId,
		});
	open(CHAT);
	const say = (id: string, sessionId = CHAT) =>
		runtime.journal.append(sessionId, {
			type: "item",
			turnId: "t",
			item: { id, kind: "agent_message", text: id, startedAtMs: 0 },
		});
	const turn = (status: "running" | "completed", usage = 0) =>
		runtime.journal.append(CHAT, {
			type: "turn",
			turn: {
				id: "t",
				status,
				startedAtMs: 0,
				usage: { inputTokens: usage, cachedInputTokens: 0, outputTokens: 0 },
			},
		});
	return { runtime, sync, pushes, say, turn, open, timers, appended };
}

describe("createChatSync", () => {
	test("pushes only what was not pushed before", async () => {
		const { sync, pushes, say } = setup();
		say("a");
		say("b");
		await sync.syncSession(CHAT);
		say("c");
		await sync.syncSession(CHAT);
		expect(pushes.map((push) => push.events.map((e) => e.seq))).toEqual([
			[1, 2],
			[3],
		]);
		expect(pushes[0]?.workspaceId).toBe(WORKSPACE);
	});

	test("a started sync writes a chat only when a turn starts or ends", async () => {
		const { sync, pushes, say, turn, timers, appended } = setup();
		sync.start();
		await timers.shift()?.();
		const flush = async () => {
			for (const envelope of appended.splice(0)) sync.noteAppend(envelope);
			await timers.shift()?.();
			await Bun.sleep(0);
		};
		turn("running");
		say("a");
		await flush();
		say("b");
		turn("running", 10);
		await flush();
		turn("completed", 10);
		await flush();
		expect(pushes.map((push) => push.events.map((e) => e.seq))).toEqual([
			[1, 2],
			[3, 4, 5],
		]);
	});

	test("a started sync pushes chats a previous run left unpushed", () => {
		const { sync, pushes, say, timers } = setup();
		say("a");
		sync.start();
		timers.shift()?.();
		expect(pushes.flatMap((push) => push.events.map((e) => e.seq))).toEqual([
			1,
		]);
	});

	test("does nothing on a host with no chat database yet", async () => {
		const timers: (() => Promise<void> | void)[] = [];
		const sync = createChatSync({
			runtime: () => null,
			api: {} as ApiClient,
			schedule: (run) => {
				timers.push(run);
				return () => {};
			},
		});
		sync.start();
		await timers.shift()?.();
		await sync.syncSession(CHAT);
		expect(timers).toHaveLength(0);
	});

	test("skips an event the API always rejects and pushes the rest", async () => {
		const { sync, pushes, say } = setup({
			reject: (input) => input.events.some((e) => e.seq === 2),
		});
		say("a");
		say("b");
		say("c");
		await sync.syncSession(CHAT);
		expect(pushes.flatMap((push) => push.events.map((e) => e.seq))).toEqual([
			1, 3,
		]);
	});

	test("a chat the API cannot take as a whole is not marked pushed", async () => {
		const { runtime, sync, pushes, say } = setup({
			harnessSessionId: "h".repeat(500),
		});
		say("a");
		await sync.syncSession(CHAT);
		expect(pushes).toHaveLength(0);
		expect(runtime.db.select().from(chatSyncState).all()).toEqual([]);
	});

	test("a busy chat takes turns with the others", async () => {
		const { sync, pushes, say, open, timers } = setup();
		open(OTHER_CHAT);
		for (let index = 0; index < 501; index += 1) say(`a${index}`);
		say("b", OTHER_CHAT);
		sync.start();
		await timers.shift()?.();
		await new Promise((resolve) => setImmediate(resolve));
		const order = pushes.map((push) => push.sessionId);
		expect(order).toHaveLength(3);
		expect(order.indexOf(OTHER_CHAT)).toBeLessThan(order.lastIndexOf(CHAT));
	});

	test("a host that does not sync keeps pushing a chat it follows", async () => {
		const { sync, pushes, say, timers, appended } = setup();
		say("before");
		for (const envelope of appended.splice(0)) sync.noteAppend(envelope);
		expect(timers).toHaveLength(0);

		sync.follow(CHAT);
		say("during");
		for (const envelope of appended.splice(0)) sync.noteAppend(envelope);
		timers.shift()?.();
		await Bun.sleep(0);
		expect(pushes.flatMap((push) => push.events.map((e) => e.seq))).toEqual([
			1, 2,
		]);
	});

	test.each([
		"CONFLICT",
		"FORBIDDEN",
		"NOT_FOUND",
	])("stops following a chat once the API answers %s", async (code) => {
		let movedAway = false;
		const { sync, pushes, say, timers, appended } = setup({
			reject: () => movedAway,
			rejectCode: code,
		});
		sync.follow(CHAT);
		say("a");
		for (const envelope of appended.splice(0)) sync.noteAppend(envelope);
		timers.shift()?.();
		await Bun.sleep(0);
		expect(pushes).toHaveLength(1);

		movedAway = true;
		say("b");
		for (const envelope of appended.splice(0)) sync.noteAppend(envelope);
		timers.shift()?.();
		await Bun.sleep(0);

		say("c");
		for (const envelope of appended.splice(0)) sync.noteAppend(envelope);
		expect(timers).toHaveLength(0);
		expect(pushes).toHaveLength(1);
	});
});
