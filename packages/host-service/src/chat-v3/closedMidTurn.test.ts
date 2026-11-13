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
	interrupted: true,
	prompts: [],
	pausedPrompts: [],
};

function fakeRuntime(
	rows: Record<string, { closedAt: number; title: string }>,
	options: {
		live?: Partial<LiveSession> | null;
		resumeThrows?: boolean;
	} = {},
) {
	const resumed: ResumeSessionInput[] = [];
	const prompted: { sessionId: string; prompts: unknown[] }[] = [];
	const closed: string[] = [];
	const runtime = {
		sessions: { get: (id: string) => rows[id] ?? null },
		live: {
			supports: () => true,
			forTerminal: () => options.live ?? null,
			require: (sessionId: string) => ({
				promptOnceStarted: (prompts: unknown[]) =>
					prompted.push({ sessionId, prompts }),
			}),
		},
		commands: {
			resumeSession: (input: ResumeSessionInput) => {
				if (options.resumeThrows) throw new Error("agent missing");
				resumed.push(input);
				return { sessionId: "chat-2", epoch: "e" };
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
			{ live: { sessionId: "chat-2", promptsSent: 0 } as never },
		);
		const chats = closedChats(runtime);

		expect(chats.list().map((chat) => chat.sessionId)).toEqual(["chat-2"]);
		expect(await chats.resume()).toBe(1);
		expect(prompted.map((p) => p.sessionId)).toEqual(["chat-2"]);
		expect(resumed).toEqual([]);
	});

	test("a chat someone already continued is not offered", () => {
		const { runtime } = fakeRuntime(
			{ "chat-1": { closedAt: 5, title: "x" } },
			{
				live: { sessionId: "chat-2", promptsSent: 1 } as never,
			},
		);
		expect(closedChats(runtime).list()).toEqual([]);
	});

	test("a chat with only queued prompts resumes with them, without being told to continue", async () => {
		const { runtime, resumed } = fakeRuntime({
			"chat-1": { closedAt: 0, title: "x" },
		});
		const chats = createClosedMidTurn({
			runtime: () => runtime,
			resolveCwd: () => "/work",
		});
		const queued = [{ type: "text" as const, text: "then the docs" }];
		chats.add({
			...CHAT,
			interrupted: false,
			prompts: [queued],
			pausedPrompts: [],
		});

		expect(await chats.resume()).toBe(1);
		expect(resumed[0]?.prompts).toEqual([queued]);
	});

	test("a chat with only a paused queue runs it when resumed", async () => {
		const { runtime, resumed } = fakeRuntime({
			"chat-1": { closedAt: 0, title: "x" },
		});
		const chats = createClosedMidTurn({
			runtime: () => runtime,
			resolveCwd: () => "/work",
		});
		const queued = [{ type: "text" as const, text: "then the docs" }];
		chats.add({
			...CHAT,
			interrupted: false,
			prompts: [],
			pausedPrompts: [queued],
		});

		expect(await chats.resume()).toBe(1);
		expect(resumed[0]).toMatchObject({ prompts: [queued], pausedPrompts: [] });
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
