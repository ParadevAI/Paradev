import { describe, expect, test } from "bun:test";
import type { ChatRuntime, ResumeSessionInput } from "@superset/chat-runtime";
import { createClosedMidTurn } from "./closedMidTurn";

const CHAT = {
	sessionId: "chat-1",
	scopeId: "workspace-1",
	harness: "claude-acp",
	harnessSessionId: "agent-1",
	terminalId: "terminal-1",
};

function fakeRuntime(
	rows: Record<string, { closedAt: number; title: string }>,
) {
	const resumed: ResumeSessionInput[] = [];
	const closed: string[] = [];
	const runtime = {
		sessions: { get: (id: string) => rows[id] ?? null },
		live: { supports: () => true },
		commands: {
			resumeSession: (input: ResumeSessionInput) => {
				resumed.push(input);
				return { sessionId: "chat-2", epoch: "e" };
			},
			closeSession: async ({ sessionId }: { sessionId: string }) => {
				closed.push(sessionId);
			},
		},
	} as unknown as ChatRuntime;
	return { runtime, resumed, closed };
}

describe("chats a quit cut off", () => {
	test("lists only the chats nobody has opened since", () => {
		const { runtime } = fakeRuntime({
			"chat-1": { closedAt: 0, title: "Fix the flaky test" },
			"chat-opened": { closedAt: 5, title: "Opened already" },
		});
		const closed = createClosedMidTurn({
			runtime: () => runtime,
			resolveCwd: () => "/work",
		});
		closed.add(CHAT);
		closed.add({ ...CHAT, sessionId: "chat-opened" });

		expect(closed.list()).toEqual([
			{
				sessionId: "chat-1",
				workspaceId: "workspace-1",
				title: "Fix the flaky test",
			},
		]);
	});

	test("Resume continues each chat from where it was cut off, once", async () => {
		const {
			runtime,
			resumed,
			closed: closedIds,
		} = fakeRuntime({
			"chat-1": { closedAt: 0, title: "Fix the flaky test" },
		});
		const closed = createClosedMidTurn({
			runtime: () => runtime,
			resolveCwd: () => "/work",
		});
		closed.add(CHAT);

		expect(await closed.resume()).toBe(1);
		expect(await closed.resume()).toBe(0);

		expect(resumed).toEqual([
			expect.objectContaining({
				harnessSessionId: "agent-1",
				terminalId: "terminal-1",
				cwd: "/work",
				replacesSessionId: "chat-1",
			}),
		]);
		expect(closedIds).toEqual(["chat-1"]);
		expect(closed.list()).toEqual([]);
	});

	test("Keep paused forgets them without resuming", async () => {
		const { runtime, resumed } = fakeRuntime({
			"chat-1": { closedAt: 0, title: "x" },
		});
		const closed = createClosedMidTurn({
			runtime: () => runtime,
			resolveCwd: () => "/work",
		});
		closed.add(CHAT);

		closed.keepPaused();

		expect(closed.list()).toEqual([]);
		expect(await closed.resume()).toBe(0);
		expect(resumed).toEqual([]);
	});
});
