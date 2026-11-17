import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ChatRuntime,
	ResumeSessionInput,
	UnfinishedSession,
} from "@superset/chat-runtime";
import {
	CONTINUE_AFTER_UPDATE_PROMPT,
	closedChatsOf,
	RESUME_MARKER_MAX_AGE_MS,
	recordUnfinishedChats,
	restoreClosedChats,
	resumeUnfinishedChats,
	writeClosedChats,
} from "./resumeAfterUpdate";

const UNFINISHED: UnfinishedSession = {
	sessionId: "chat-1",
	scopeId: "workspace-1",
	harness: "claude-acp",
	harnessSessionId: "agent-1",
	terminalId: "terminal-1",
	modeId: "default",
	interrupted: true,
	prompts: [[{ type: "text", text: "queued" }]],
	pausedPrompts: [],
};

function fakeRuntime(unfinished: UnfinishedSession[]) {
	const resumed: ResumeSessionInput[] = [];
	const runtime = {
		live: { unfinished: () => unfinished, supports: () => true },
		commands: {
			resumeSession: (input: ResumeSessionInput) => {
				resumed.push(input);
				return { sessionId: "chat-2", epoch: "e" };
			},
		},
	} as unknown as ChatRuntime;
	return { runtime, resumed };
}

function markerIn(contents?: object): string {
	const markerPath = join(
		mkdtempSync(join(tmpdir(), "chat-resume-")),
		"m.json",
	);
	if (contents) writeFileSync(markerPath, JSON.stringify(contents));
	return markerPath;
}

describe("resuming chats after an update", () => {
	test("a chat cut off by the update continues on the next boot", () => {
		const markerPath = markerIn({ requestedAt: 1_000 });
		const { runtime, resumed } = fakeRuntime([UNFINISHED]);

		recordUnfinishedChats(runtime, markerPath);
		resumeUnfinishedChats({
			markerPath,
			runtime: () => runtime,
			resolveCwd: (scopeId) => `/worktrees/${scopeId}`,
			now: 2_000,
		});

		expect(resumed).toEqual([
			{
				scopeId: "workspace-1",
				sourceSessionId: "chat-1",
				harness: "claude-acp",
				harnessSessionId: "agent-1",
				terminalId: "terminal-1",
				modeId: "default",
				cwd: "/worktrees/workspace-1",
				prompts: [
					[{ type: "text", text: CONTINUE_AFTER_UPDATE_PROMPT }],
					[{ type: "text", text: "queued" }],
				],
				pausedPrompts: [],
			},
		]);
		expect(existsSync(markerPath)).toBe(false);
	});

	test("a chat whose agent config can no longer carry it is offered, not continued", () => {
		const markerPath = markerIn({ requestedAt: 1_000 });
		const { runtime, resumed } = fakeRuntime([UNFINISHED]);

		recordUnfinishedChats(runtime, markerPath);
		const result = resumeUnfinishedChats({
			markerPath,
			runtime: () => runtime,
			resolveCwd: (scopeId) => `/worktrees/${scopeId}`,
			keepsAccount: () => false,
			now: 2_000,
		});

		expect(resumed).toEqual([]);
		expect(result.offer.map((chat) => chat.sessionId)).toEqual(["chat-1"]);
	});

	test("an entry that no longer parses does not stop the others", () => {
		const markerPath = markerIn({
			requestedAt: 1_000,
			sessions: [{ harness: "claude-acp" }, UNFINISHED],
		});
		const { runtime, resumed } = fakeRuntime([]);

		resumeUnfinishedChats({
			markerPath,
			runtime: () => runtime,
			resolveCwd: () => "/worktree",
			now: 2_000,
		});

		expect(resumed.map((input) => input.harnessSessionId)).toEqual(["agent-1"]);
	});

	test("a quit that was not for an update records nothing", () => {
		const markerPath = markerIn();
		recordUnfinishedChats(fakeRuntime([UNFINISHED]).runtime, markerPath);
		expect(existsSync(markerPath)).toBe(false);
	});

	test("a marker too old to resume hands its chats to the launch prompt", () => {
		const markerPath = markerIn({ requestedAt: 0, sessions: [UNFINISHED] });
		const { runtime, resumed } = fakeRuntime([]);

		const result = resumeUnfinishedChats({
			markerPath,
			runtime: () => runtime,
			resolveCwd: () => "/worktree",
			now: RESUME_MARKER_MAX_AGE_MS + 1,
		});

		expect(resumed).toEqual([]);
		expect(result.offer.map((chat) => chat.sessionId)).toEqual(["chat-1"]);
		expect(existsSync(markerPath)).toBe(false);
	});

	test("a resume that fails hands its chat to the launch prompt", () => {
		const markerPath = markerIn({ requestedAt: 1_000, sessions: [UNFINISHED] });
		const { runtime } = fakeRuntime([]);
		(
			runtime.commands as unknown as { resumeSession: () => never }
		).resumeSession = () => {
			throw new Error("agent missing");
		};

		const result = resumeUnfinishedChats({
			markerPath,
			runtime: () => runtime,
			resolveCwd: () => "/worktree",
			now: 2_000,
		});

		expect(result).toMatchObject({
			resumed: 0,
			offer: [{ sessionId: "chat-1" }],
		});
	});
});

describe("chats a quit cut off", () => {
	test("every chat with work left is recorded, queued prompts included", () => {
		const path = markerIn();
		const queuedOnly = {
			...UNFINISHED,
			sessionId: "chat-queued-only",
			interrupted: false,
		};
		writeClosedChats(
			path,
			closedChatsOf(fakeRuntime([UNFINISHED, queuedOnly]).runtime),
		);

		expect(restoreClosedChats(path)).toEqual([
			expect.objectContaining({ sessionId: "chat-1", interrupted: true }),
			expect.objectContaining({
				sessionId: "chat-queued-only",
				interrupted: false,
				prompts: [[{ type: "text", text: "queued" }]],
			}),
		]);
	});

	test("no chats with work left removes the record", () => {
		const path = markerIn({ sessions: [UNFINISHED] });
		writeClosedChats(path, []);
		expect(existsSync(path)).toBe(false);
		expect(restoreClosedChats(path)).toEqual([]);
	});

	test("a record from before queued prompts were kept still reads", () => {
		const path = markerIn({
			sessions: [
				{
					sessionId: "chat-1",
					scopeId: "w",
					harness: "claude-acp",
					harnessSessionId: "a",
				},
			],
		});
		expect(restoreClosedChats(path)).toEqual([
			expect.objectContaining({
				interrupted: true,
				prompts: [],
				pausedPrompts: [],
			}),
		]);
	});
});
