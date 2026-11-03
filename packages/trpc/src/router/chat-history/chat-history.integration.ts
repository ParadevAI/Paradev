import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DurableEvent } from "@superset/chat/protocol";

const { db } = await import("@superset/db/client");
const { chatSessions, members, organizations, users } = await import(
	"@superset/db/schema"
);
const { eq, inArray } = await import("drizzle-orm");
const { chatHistoryRouter } = await import("./chat-history");
const { loadChatHistory } = await import("./utils/loadChatHistory");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const CLOUD_WORKSPACE = crypto.randomUUID();
const suffix = Date.now();
const sessions: string[] = [];

const createCaller = createCallerFactory(
	createTRPCRouter({
		chatHistory: chatHistoryRouter,
	}),
);

function routerFor(userId: string, box?: string) {
	return createCaller(
		createTRPCContext({
			session: {
				user: { id: userId, email: `u-${userId}@example.com` },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
			sandboxCaller: box
				? { workspaceId: box, organizationId: ORG, userId }
				: null,
		}),
	);
}

function callerFor(userId: string, box?: string) {
	return routerFor(userId, box).chatHistory;
}

const owner = callerFor(USER);

function newSession(): string {
	const id = crypto.randomUUID();
	sessions.push(id);
	return id;
}

function agentMessage(id: string, text: string, startedAtMs = 1): DurableEvent {
	return {
		type: "item",
		turnId: "turn-1",
		item: { id, kind: "agent_message", text, startedAtMs },
	} as DurableEvent;
}

function toolCall(id: string, status: string, title: string): DurableEvent {
	return {
		type: "item",
		turnId: "turn-1",
		item: {
			id,
			kind: "tool_call",
			title,
			toolKind: "execute",
			toolName: "bash",
			status,
			content: [],
			startedAtMs: 1,
		},
	} as DurableEvent;
}

function sessionEvent(status: string, title: string): DurableEvent {
	return {
		type: "session",
		session: { status, title, harness: "claude-acp" },
	} as DurableEvent;
}

function push(
	sessionId: string,
	events: { seq: number; event: DurableEvent }[],
	options: {
		epoch?: string;
		workspaceId?: string;
		as?: typeof owner;
		harnessSessionId?: string;
	} = {},
) {
	return (options.as ?? owner).push({
		sessionId,
		workspaceId: options.workspaceId ?? WORKSPACE,
		harness: "claude-acp",
		harnessSessionId: options.harnessSessionId ?? "harness-1",
		epoch: options.epoch ?? "epoch-1",
		events: events.map((event) => ({ ...event, ts: 1 })),
	});
}

beforeAll(async () => {
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Chat Org", slug: `chat-org-${suffix}` });
	await db.insert(users).values([
		{
			id: USER,
			name: "Chat User",
			email: `chat-${suffix}@example.com`,
			organizationIds: [ORG],
		},
		{
			id: OTHER_USER,
			name: "Other User",
			email: `chat-other-${suffix}@example.com`,
			organizationIds: [ORG],
		},
	]);
	await db.insert(members).values([
		{ organizationId: ORG, userId: USER, role: "member" },
		{ organizationId: ORG, userId: OTHER_USER, role: "member" },
	]);
});

async function history(sessionId: string) {
	const session = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, sessionId),
	});
	if (!session) throw new Error(`no chat ${sessionId}`);
	return { session, ...(await loadChatHistory(session)) };
}

afterAll(async () => {
	if (sessions.length > 0) {
		await db.delete(chatSessions).where(inArray(chatSessions.id, sessions));
	}
	await db.delete(users).where(inArray(users.id, [USER, OTHER_USER]));
	await db.delete(organizations).where(inArray(organizations.id, [ORG]));
});

describe("chatHistory.push", () => {
	test("keeps the newest version of each item, in first-appearance order, whatever order retries arrive in", async () => {
		const sessionId = newSession();
		const events = [
			{ seq: 1, event: toolCall("tool", "running", "Run tests") },
			{ seq: 2, event: agentMessage("reply", "Running the tests now") },
			{ seq: 3, event: toolCall("tool", "completed", "Run tests") },
		];
		await push(sessionId, events.slice(0, 2));
		await push(sessionId, events.slice(2));
		await push(sessionId, [...events].reverse());

		const stored = await history(sessionId);
		expect(stored.events.map((row) => row.seq)).toEqual([1, 2]);
		const tool = stored.events[0]?.event;
		expect(tool?.type === "item" && tool.item.status).toBe("completed");
		expect(stored.session.lastSeq).toBe(3);
		expect(stored.session.epoch).toBe("epoch-1");
	});

	test("a new epoch starts the chat again", async () => {
		const sessionId = newSession();
		await push(sessionId, [
			{ seq: 1, event: sessionEvent("idle", "Old title") },
			{ seq: 2, event: agentMessage("old", "old") },
		]);
		await push(sessionId, [{ seq: 1, event: agentMessage("new", "new") }], {
			epoch: "epoch-2",
		});
		const stored = await history(sessionId);
		expect(
			stored.events.map(
				(row) => row.event.type === "item" && row.event.item.id,
			),
		).toEqual(["new"]);
		expect(stored.session.epoch).toBe("epoch-2");
		expect(stored.session.title).toBeNull();
	});

	test("only the owner can write a chat", async () => {
		const sessionId = newSession();
		await push(sessionId, [{ seq: 1, event: agentMessage("a", "private") }]);
		await expect(
			push(sessionId, [{ seq: 2, event: agentMessage("b", "b") }], {
				as: callerFor(OTHER_USER),
			}),
		).rejects.toThrow("not found");
	});

	test("a box may only sync its own workspace's chats", async () => {
		const sessionId = newSession();
		const box = callerFor(USER, CLOUD_WORKSPACE);
		await expect(
			push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }], {
				as: box,
				workspaceId: WORKSPACE,
			}),
		).rejects.toThrow("only sync its own chats");

		await push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }], {
			as: box,
			workspaceId: CLOUD_WORKSPACE,
		});
		expect((await history(sessionId)).events).toHaveLength(1);
	});

	test("the old host can no longer write a chat that moved", async () => {
		const sessionId = newSession();
		await push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }]);
		await expect(
			push(sessionId, [{ seq: 2, event: agentMessage("b", "b") }], {
				workspaceId: CLOUD_WORKSPACE,
			}),
		).rejects.toThrow("moved to another workspace");
	});

	test("a late retry of an older batch keeps the newer title and status", async () => {
		const sessionId = newSession();
		await push(sessionId, [
			{ seq: 1, event: sessionEvent("running", "Old title") },
			{ seq: 2, event: sessionEvent("idle", "New title") },
		]);
		await push(sessionId, [
			{ seq: 1, event: sessionEvent("running", "Old title") },
		]);
		const { session } = await history(sessionId);
		expect(session).toMatchObject({ title: "New title", status: "idle" });
	});
});

describe("chatHistory.search", () => {
	test("finds code names, groups copies of one conversation, and shows only the caller's chats", async () => {
		const first = newSession();
		const copy = newSession();
		const unrelated = newSession();
		const someoneElses = newSession();
		const text = "Fixed packages/chat-runtime/src/harness/acp/acpAdapter.ts";
		await push(first, [{ seq: 1, event: agentMessage("x", text) }]);
		await push(copy, [{ seq: 1, event: agentMessage("y", text) }]);
		await push(someoneElses, [{ seq: 1, event: agentMessage("w", text) }], {
			as: callerFor(OTHER_USER),
			harnessSessionId: "harness-other",
		});
		await push(unrelated, [
			{ seq: 1, event: agentMessage("z", "Nothing relevant here") },
		]);

		const results = await owner.search({ query: "acpAdapter" });
		const ids = results.map((row) => row.sessionId);
		expect(ids.filter((id) => id === first || id === copy)).toHaveLength(1);
		expect(ids).not.toContain(unrelated);
		expect(ids).not.toContain(someoneElses);
		expect(results[0]?.snippet).toContain("acpAdapter");

		const theirs = await callerFor(OTHER_USER).search({ query: "acpAdapter" });
		expect(theirs.map((row) => row.sessionId)).toEqual([someoneElses]);
	});

	test("one long chat does not crowd out the others", async () => {
		const word = `zebracorn${suffix}`;
		const long = newSession();
		const short = newSession();
		const many = Array.from({ length: 501 }, (_, index) => ({
			seq: index + 1,
			event: agentMessage(`m${index}`, `${word} ${word} ${word}`),
		}));
		const own = { harnessSessionId: long };
		await push(long, many.slice(0, 500), own);
		await push(long, many.slice(500), own);
		await push(
			short,
			[{ seq: 1, event: agentMessage("s", `${word} once, among other words`) }],
			{ harnessSessionId: short },
		);

		const ids = (await owner.search({ query: word })).map(
			(row) => row.sessionId,
		);
		expect(ids).toContain(long);
		expect(ids).toContain(short);
	});
});
