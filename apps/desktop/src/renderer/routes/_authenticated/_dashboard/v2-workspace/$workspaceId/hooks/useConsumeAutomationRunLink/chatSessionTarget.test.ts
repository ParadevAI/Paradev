import { describe, expect, it } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import { chatSessionTarget } from "./chatSessionTarget";

type SessionResult = Awaited<ReturnType<ChatTransport["getSession"]>>;
const session: NonNullable<SessionResult["session"]> = {
	sessionId: "chat-1",
	scopeId: "workspace-1",
	harness: "claude-acp",
	harnessSessionId: "native-1",
	epoch: "epoch-1",
	status: "idle",
	title: "Automation run",
	queuedCount: 0,
	updatedAt: 1,
};
const result: SessionResult = { session, cursor: null, live: true };
const liveSession: Awaited<ReturnType<ChatTransport["listSessions"]>>[number] =
	{
		...session,
		live: true,
		terminalId: "terminal-1",
	};
const args = {
	result,
	sessions: [liveSession],
	sessionId: "chat-1",
	workspaceId: "workspace-1",
};

describe("chatSessionTarget", () => {
	it("resolves the runtime session with its live terminal and native identity", () => {
		expect(chatSessionTarget(args)).toEqual({
			sessionId: "chat-1",
			presetId: "claude",
			harnessSessionId: "native-1",
			terminalId: "terminal-1",
			title: "Automation run",
		});
	});

	it("rejects missing, mismatched, out-of-scope, and unsupported sessions", () => {
		expect(
			chatSessionTarget({ ...args, result: { ...result, session: null } }),
		).toBeNull();
		expect(chatSessionTarget({ ...args, sessionId: "other-chat" })).toBeNull();
		expect(
			chatSessionTarget({ ...args, workspaceId: "other-workspace" }),
		).toBeNull();
		expect(
			chatSessionTarget({
				...args,
				result: { ...result, session: { ...session, harness: "unknown" } },
			}),
		).toBeNull();
	});

	it("does not reuse a dead or unrelated terminal", () => {
		expect(
			chatSessionTarget({ ...args, result: { ...result, live: false } })
				?.terminalId,
		).toBeUndefined();
		expect(
			chatSessionTarget({
				...args,
				sessions: [{ ...liveSession, live: false }],
			})?.terminalId,
		).toBeUndefined();
		expect(
			chatSessionTarget({
				...args,
				sessions: [{ ...liveSession, sessionId: "other-chat" }],
			})?.terminalId,
		).toBeUndefined();
	});
});
