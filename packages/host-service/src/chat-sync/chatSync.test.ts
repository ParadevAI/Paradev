import { describe, expect, test } from "bun:test";
import type { DurableEnvelope } from "@superset/chat/protocol";
import { createTestRuntime } from "@superset/chat-runtime/testing";
import type { ApiClient } from "../types";
import { createChatSync } from "./chatSync";

type PushInput = {
	sessionId: string;
	workspaceId: string;
	events: { seq: number }[];
};

function setup(reject: (input: PushInput) => boolean = () => false) {
	const appended: DurableEnvelope[] = [];
	const runtime = createTestRuntime({ onAppend: (e) => appended.push(e) });
	const pushes: PushInput[] = [];
	const api = {
		chatHistory: {
			push: {
				mutate: async (input: PushInput) => {
					if (reject(input)) {
						throw Object.assign(new Error("bad event"), {
							data: { code: "BAD_REQUEST" },
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
	runtime.journal.open({
		sessionId: "s",
		scopeId: "workspace-1",
		harness: "fake",
	});
	const say = (id: string) =>
		runtime.journal.append("s", {
			type: "item",
			turnId: "t",
			item: { id, kind: "agent_message", text: id, startedAtMs: 0 },
		});
	return { runtime, sync, pushes, say, timers, appended };
}

describe("createChatSync", () => {
	test("pushes only what was not pushed before", async () => {
		const { sync, pushes, say } = setup();
		say("a");
		say("b");
		await sync.syncSession("s");
		say("c");
		await sync.syncSession("s");
		expect(pushes.map((push) => push.events.map((e) => e.seq))).toEqual([
			[1, 2],
			[3],
		]);
		expect(pushes[0]?.workspaceId).toBe("workspace-1");
	});

	test("a started sync pushes appends when its timer fires", async () => {
		const { sync, pushes, say, timers, appended } = setup();
		sync.start();
		say("a");
		for (const envelope of appended) sync.noteAppend(envelope);
		expect(pushes).toHaveLength(0);
		await timers.shift()?.();
		await Promise.resolve();
		expect(pushes.flatMap((push) => push.events.map((e) => e.seq))).toEqual([
			1,
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

	test("skips an event the API always rejects and pushes the rest", async () => {
		const { sync, pushes, say } = setup((input) =>
			input.events.some((e) => e.seq === 2),
		);
		say("a");
		say("b");
		say("c");
		await sync.syncSession("s");
		expect(pushes.flatMap((push) => push.events.map((e) => e.seq))).toEqual([
			1, 3,
		]);
	});
});
