import { expect, test } from "bun:test";
import { latestOpenChatSessions } from "./latestOpenChatSessions";

function row(
	sessionId: string,
	overrides: Partial<Parameters<typeof latestOpenChatSessions>[0][number]> = {},
) {
	return {
		sessionId,
		harnessSessionId: null,
		terminalId: null,
		live: false,
		closedAt: null,
		updatedAt: 0,
		...overrides,
	};
}

const ids = (sessions: { sessionId: string }[]) =>
	sessions.map((session) => session.sessionId);

test("a chat stopped by a restart opens, and a closed one does not", () => {
	expect(
		ids(
			latestOpenChatSessions(
				[row("stopped"), row("closed", { closedAt: 5 })],
				new Set(),
			),
		),
	).toEqual(["stopped"]);
});

test("a resumed conversation opens once, from its newest session", () => {
	const sessions = [
		row("old", { harnessSessionId: "h", updatedAt: 1 }),
		row("new", { harnessSessionId: "h", updatedAt: 2 }),
		row("older", { harnessSessionId: "h", updatedAt: 0 }),
	];
	expect(ids(latestOpenChatSessions(sessions, new Set()))).toEqual(["new"]);
});

test("closing the newest session closes the whole conversation", () => {
	const sessions = [
		row("old", { harnessSessionId: "h", updatedAt: 1 }),
		row("new", { harnessSessionId: "h", updatedAt: 2, closedAt: 3 }),
	];
	expect(latestOpenChatSessions(sessions, new Set())).toEqual([]);
});

test("a conversation a pane already shows is skipped, by session or terminal", () => {
	const sessions = [
		row("shown", { harnessSessionId: "a", updatedAt: 1 }),
		row("replacement", { harnessSessionId: "a", updatedAt: 2, live: true }),
		row("in-terminal", { harnessSessionId: "b", terminalId: "t", live: true }),
	];
	expect(latestOpenChatSessions(sessions, new Set(["shown", "t"]))).toEqual([]);
});

test("a session still stopping after its close does not open", () => {
	expect(
		latestOpenChatSessions(
			[row("closing", { live: true, closedAt: 5 })],
			new Set(),
		),
	).toEqual([]);
});

test("an older host without closedAt only opens live sessions", () => {
	const sessions = [
		row("stopped", { closedAt: undefined }),
		row("running", { closedAt: undefined, live: true }),
	];
	expect(ids(latestOpenChatSessions(sessions, new Set()))).toEqual(["running"]);
});
