import { describe, expect, test } from "bun:test";
import type {
	ChatRuntime,
	LiveSession,
	ResumeSessionInput,
} from "@superset/chat-runtime";
import { createClosedMidTurn } from "./closedMidTurn";

const CHAT = {
	sessionId: "chat-1",
	scopeId: "workspace-1",
	harness: "claude-acp",
	harnessSessionId: "agent-1",
	terminalId: "terminal-1",
	modeId: "plan",
	modelId: "opus",
};

const PAUSED_TURN = {
	id: "t1",
	status: "interrupted",
	error: { message: "x", kind: "host_stopped" },
	startedAtMs: 1,
};

function fakeRuntime(
	rows: Record<string, { closedAt: number; title: string }>,
	options: {
		live?: Partial<LiveSession> | null;
		resumeThrows?: boolean;
	} = {},
) {
	const resumed: ResumeSessionInput[] = [];
	const prompted: string[] = [];
	const closed: string[] = [];
	const runtime = {
		sessions: { get: (id: string) => rows[id] ?? null },
		live: {
			supports: () => true,
			forTerminal: () => options.live ?? null,
		},
		commands: {
			resumeSession: (input: ResumeSessionInput) => {
				if (options.resumeThrows) throw new Error("agent missing");
				resumed.push(input);
				return { sessionId: "chat-2", epoch: "e" };
			},
			prompt: ({ sessionId }: { sessionId: string }) => {
				prompted.push(sessionId);
				return { itemId: "i", queued: false };
			},
			closeSession: async ({ sessionId }: { sessionId: string }) => {
				closed.push(sessionId);
			},
		},
	} as unknown as ChatRuntime;
	return { runtime, resumed, prompted, closed };
}

function closedChats(runtime: ChatRuntime) {
	const closed = createClosedMidTurn({
		runtime: () => runtime,
		resolveCwd: () => "/work",
	});
	closed.add(CHAT);
	return closed;
}

describe("chats a quit cut off", () => {
	test("Resume continues the chat with its mode and model, once", async () => {
		const { runtime, resumed, closed } = fakeRuntime({
			"chat-1": { closedAt: 0, title: "Fix the flaky test" },
		});
		const chats = closedChats(runtime);

		expect(chats.list()).toEqual([
			{
				sessionId: "chat-1",
				workspaceId: "workspace-1",
				title: "Fix the flaky test",
			},
		]);
		expect(await chats.resume()).toBe(1);
		expect(await chats.resume()).toBe(0);

		expect(resumed).toEqual([
			expect.objectContaining({
				harnessSessionId: "agent-1",
				modeId: "plan",
				modelId: "opus",
				replacesSessionId: "chat-1",
			}),
		]);
		expect(closed).toEqual(["chat-1"]);
	});

	test("a chat whose pane already reopened it is resumed where it is now", async () => {
		const { runtime, resumed, prompted } = fakeRuntime(
			{
				"chat-1": { closedAt: 5, title: "Fix the flaky test" },
				"chat-2": { closedAt: 0, title: "Fix the flaky test" },
			},
			{ live: { sessionId: "chat-2", turn: PAUSED_TURN } as never },
		);
		const chats = closedChats(runtime);

		expect(chats.list().map((chat) => chat.sessionId)).toEqual(["chat-2"]);
		expect(await chats.resume()).toBe(1);
		expect(prompted).toEqual(["chat-2"]);
		expect(resumed).toEqual([]);
	});

	test("a chat someone already continued is not offered", () => {
		const { runtime } = fakeRuntime(
			{ "chat-1": { closedAt: 5, title: "x" } },
			{
				live: {
					sessionId: "chat-2",
					turn: { ...PAUSED_TURN, status: "running" },
				} as never,
			},
		);
		expect(closedChats(runtime).list()).toEqual([]);
	});

	test("a resume that fails keeps the chat to try again", async () => {
		const { runtime } = fakeRuntime(
			{ "chat-1": { closedAt: 0, title: "x" } },
			{ resumeThrows: true },
		);
		const chats = closedChats(runtime);

		expect(await chats.resume()).toBe(0);
		expect(chats.list()).toHaveLength(1);
	});

	test("Keep paused forgets them without resuming", async () => {
		const { runtime, resumed } = fakeRuntime({
			"chat-1": { closedAt: 0, title: "x" },
		});
		const chats = closedChats(runtime);

		chats.keepPaused();

		expect(chats.list()).toEqual([]);
		expect(await chats.resume()).toBe(0);
		expect(resumed).toEqual([]);
	});
});
