import { describe, expect, test } from "bun:test";
import { listWorkspaceChats } from "./listWorkspaceChats";

function row(
	sessionId: string,
	status: string,
	{
		live,
		harnessSessionId = null,
		closedAt = null,
	}: {
		live?: boolean;
		harnessSessionId?: string | null;
		closedAt?: number | null;
	} = {},
) {
	return {
		sessionId,
		scopeId: "workspace-1",
		harness: "claude-acp",
		harnessSessionId,
		epoch: "e1",
		status,
		title: null,
		queuedCount: 0,
		updatedAt: 1,
		closedAt,
		closedByUser: false,
		terminalId: null,
		...(live === undefined ? {} : { live }),
	};
}

const notAsked = async (): Promise<never> => {
	throw new Error("not asked when the host reports live");
};

describe("listWorkspaceChats", () => {
	test("keeps running chats and chats stopped without being closed", async () => {
		const chats = await listWorkspaceChats({
			listSessions: async () =>
				[
					row("running", "idle", { live: true, harnessSessionId: "a" }),
					row("restarted", "idle", { live: false, harnessSessionId: "b" }),
					row("closed", "idle", {
						live: false,
						harnessSessionId: "c",
						closedAt: 5,
					}),
					row("never-started", "dead", { live: false }),
				] as never,
			getSession: notAsked,
		});
		expect(
			chats.map((chat) => [chat.sessionId, chat.live, chat.harnessSessionId]),
		).toEqual([
			["running", true, "a"],
			["restarted", false, "b"],
		]);
	});

	test("a stopped chat whose agent session runs on in another chat shows once", async () => {
		const chats = await listWorkspaceChats({
			listSessions: async () =>
				[
					row("older-stopped", "idle", { live: false, harnessSessionId: "a" }),
					row("replacement", "idle", { live: true, harnessSessionId: "a" }),
					row("stopped", "idle", { live: false, harnessSessionId: "b" }),
					row("stopped-again", "idle", { live: false, harnessSessionId: "b" }),
				] as never,
			getSession: notAsked,
		});
		expect(chats.map((chat) => chat.sessionId)).toEqual([
			"replacement",
			"stopped",
		]);
	});

	test("asks an older host per session, skipping dead ones", async () => {
		const asked: string[] = [];
		const chats = await listWorkspaceChats({
			listSessions: async () =>
				[row("a", "idle"), row("b", "dead"), row("c", "running")] as never,
			getSession: async ({ sessionId }) => {
				asked.push(sessionId);
				return { live: sessionId === "c", session: null, cursor: null };
			},
		});
		expect(asked).toEqual(["a", "c"]);
		expect(chats.map((chat) => [chat.sessionId, chat.live])).toEqual([
			["c", true],
		]);
	});

	test("an older host's running chat behind ten closed ones still shows", async () => {
		const closed = Array.from({ length: 12 }, (_, index) =>
			row(`closed-${index}`, "idle"),
		);
		const chats = await listWorkspaceChats({
			listSessions: async () => [...closed, row("running", "idle")] as never,
			getSession: async ({ sessionId }) => ({
				live: sessionId === "running",
				session: null,
				cursor: null,
			}),
		});
		expect(chats.map((chat) => chat.sessionId)).toEqual(["running"]);
	});
});
