import { describe, expect, test } from "bun:test";
import { listOpenChats } from "./listOpenChats";

function row(
	sessionId: string,
	status: string,
	live?: boolean,
	closed: { closedAt?: number | null; closedByUser?: boolean } = {},
) {
	return {
		sessionId,
		scopeId: "workspace-1",
		harness: "claude-acp",
		harnessSessionId: null,
		epoch: "e1",
		status,
		title: null,
		queuedCount: 0,
		updatedAt: 1,
		...(live === undefined ? {} : { live }),
		...closed,
	};
}

describe("listOpenChats", () => {
	test("keeps every chat that is not closed, running or finished", async () => {
		const chats = await listOpenChats({
			listSessions: async () => [
				row("running", "idle", true),
				row("finished", "idle", false),
				row("closed-by-host", "idle", false, { closedAt: 5 }),
				row("closed-by-user", "idle", false, {
					closedAt: 5,
					closedByUser: true,
				}),
			],
			getSession: async () => {
				throw new Error("not asked when the host reports live");
			},
		});
		expect(chats.map((chat) => [chat.sessionId, chat.live] as const)).toEqual([
			["running", true],
			["finished", false],
		]);
	});

	test("asks an older host per session, skipping dead ones", async () => {
		const asked: string[] = [];
		const chats = await listOpenChats({
			listSessions: async () =>
				[row("a", "idle"), row("b", "dead"), row("c", "running")] as never,
			getSession: async ({ sessionId }) => {
				asked.push(sessionId);
				return { live: sessionId === "c", session: null, cursor: null };
			},
		});
		expect(asked).toEqual(["a", "c"]);
		expect(chats.map((chat) => chat.sessionId)).toEqual(["c"]);
	});

	test("an older host's running chat behind ten closed ones still shows", async () => {
		const closed = Array.from({ length: 12 }, (_, index) =>
			row(`closed-${index}`, "idle"),
		);
		const chats = await listOpenChats({
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
