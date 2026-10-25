import { describe, expect, it } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import { historyEntries } from "./historyEntries";

type SavedSession = Awaited<ReturnType<ChatTransport["listSessions"]>>[number];
function saved(overrides: Partial<SavedSession> = {}): SavedSession {
	return {
		sessionId: "saved-1",
		scopeId: "workspace",
		harness: "claude-acp",
		harnessSessionId: "native-1",
		epoch: "epoch",
		status: "idle",
		title: "Saved chat",
		queuedCount: 0,
		updatedAt: 1000,
		live: false,
		terminalId: null,
		...overrides,
	};
}

describe("historyEntries", () => {
	it("deduplicates native history against saved chats and prefers an open session", () => {
		const entries = historyEntries(
			[
				saved({ sessionId: "stopped-copy", updatedAt: 3000 }),
				saved({ live: true, terminalId: "terminal" }),
			],
			[
				{
					sessionId: "native-1",
					cwd: "/repo",
					title: "Native chat",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			],
			"claude-acp",
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			sessionId: "saved-1",
			harnessSessionId: "native-1",
			terminalId: "terminal",
			title: "Saved chat",
		});
	});

	it("keeps provider histories separate and orders native-only chats by recency", () => {
		const entries = historyEntries(
			[saved(), saved({ harness: "codex-acp", harnessSessionId: "other" })],
			[
				{ sessionId: "old", cwd: "/repo" },
				{
					sessionId: "recent",
					cwd: "/repo",
					updatedAt: "2026-01-01T00:00:00Z",
				},
			],
			"claude-acp",
		);
		expect(entries.map((entry) => entry.key)).toEqual([
			"recent",
			"native-1",
			"old",
		]);
		expect(entries[0]).toMatchObject({
			presetId: "claude",
			sessionId: null,
			harnessSessionId: "recent",
		});
	});
});
