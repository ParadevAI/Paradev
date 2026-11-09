import { Database } from "bun:sqlite";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import type { DurableEvent } from "@superset/chat/protocol";
import { stub } from "../../../test/stub";

const { db } = await import("@superset/db/client");
const {
	chatSessions,
	chatTranscripts,
	cloudWorkspaces,
	environments,
	files,
	members,
	organizations,
	users,
	v2Hosts,
	v2UsersHosts,
} = await import("@superset/db/schema");
const { MoveBook } = await import("@superset/shared/move-book");
const { posthog } = await import("../../lib/analytics");
const { callMoves, setMoveStore } = await import("../../lib/moves");
type MoveStore = Parameters<typeof setMoveStore>[0];
const { eq, inArray } = await import("drizzle-orm");
const { chatHistoryRouter } = await import("./chat-history");
const { loadChatHistory } = await import("./utils/loadChatHistory");
const { chatMoveRouter } = await import("../chat-move");
const { abandonWorkspaceMove, attachWorkspaceMove, beginWorkspaceMove } =
	await import("../chat-move/utils/createWorkspaceMove");
const { failChatMovesTo } = await import("../chat-move/utils/queueChatMove");
const { workspaceMoveRouter } = await import("../workspace-move");
const { buildChatImport, completeChatMove, runChatMove } = await import(
	"../chat-move/utils/runChatMove"
);
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
/** The laptop workspace chats are pushed from; each move test gets its own. */
let WORKSPACE = crypto.randomUUID();
const CLOUD_WORKSPACE = crypto.randomUUID();
const LAPTOP = `laptop-${crypto.randomUUID()}`;
const THEIR_HOST = `their-host-${crypto.randomUUID()}`;
const DESKTOP = `desktop-${crypto.randomUUID()}`;
const DESKTOP_WORKSPACE = crypto.randomUUID();
const suffix = Date.now();
const sessions: string[] = [];
const fileIds: string[] = [];

const MY_CLOUD = crypto.randomUUID();
const THEIR_CLOUD = crypto.randomUUID();

const moveDb = new Database(":memory:");
const moveBook = new MoveBook(
	{
		exec(query, ...bindings) {
			const rows = moveDb.query(query).all(...(bindings as never[]));
			return { toArray: () => rows as never[] };
		},
	},
	(fn) => moveDb.transaction(fn)(),
	ORG,
);
const localMoves: MoveStore = async (organizationId, request) => {
	if (organizationId !== ORG) throw new Error(`no moves for ${organizationId}`);
	return moveBook.apply(structuredClone(request));
};
setMoveStore(localMoves);

async function withMoveStore<T>(store: MoveStore, run: () => Promise<T>) {
	setMoveStore(store);
	try {
		return await run();
	} finally {
		setMoveStore(localMoves);
	}
}

let movesFlag: boolean | undefined = true;
stub(posthog, { isFeatureEnabled: () => Promise.resolve(movesFlag) });

/** Makes a move look as if it last changed state an hour ago. */
function backdateMove(table: "chat_moves" | "workspace_moves", id: string) {
	moveDb
		.query(`UPDATE ${table} SET updated_at = ? WHERE id = ?`)
		.run(Date.now() - 60 * 60 * 1000, id);
}

const createCaller = createCallerFactory(
	createTRPCRouter({
		chatHistory: chatHistoryRouter,
		chatMove: chatMoveRouter,
		workspaceMove: workspaceMoveRouter,
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
	await db.insert(v2Hosts).values([
		{ organizationId: ORG, machineId: LAPTOP, name: "Laptop" },
		{ organizationId: ORG, machineId: DESKTOP, name: "Desktop" },
		{ organizationId: ORG, machineId: THEIR_HOST, name: "Their computer" },
	]);
	await db.insert(v2UsersHosts).values([
		{ organizationId: ORG, userId: USER, hostId: LAPTOP },
		{ organizationId: ORG, userId: USER, hostId: DESKTOP },
		{ organizationId: ORG, userId: OTHER_USER, hostId: THEIR_HOST },
	]);
	const [environment] = await db
		.insert(environments)
		.values({
			organizationId: ORG,
			name: "Env",
			sourceKind: "image",
			sourceRef: "image",
			bundleSha: "sha",
		})
		.returning({ id: environments.id });
	await db.insert(cloudWorkspaces).values(
		[
			{ id: MY_CLOUD, userId: USER },
			{ id: THEIR_CLOUD, userId: OTHER_USER },
		].map(({ id, userId }) => ({
			id,
			organizationId: ORG,
			name: "Cloud",
			branch: "b",
			baseBranch: "main",
			providerSandboxId: `ws-${id}`,
			status: "ready" as const,
			environmentId: environment?.id as string,
			createdByUserId: userId,
		})),
	);
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
	if (fileIds.length > 0) {
		await db.delete(files).where(inArray(files.id, fileIds));
	}
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

	test("a box whose chat moved away hears that it moved", async () => {
		const sessionId = newSession();
		const box = callerFor(USER, CLOUD_WORKSPACE);
		await push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }], {
			as: box,
			workspaceId: CLOUD_WORKSPACE,
		});
		await db
			.update(chatSessions)
			.set({ v2WorkspaceId: WORKSPACE })
			.where(eq(chatSessions.id, sessionId));
		await expect(
			push(sessionId, [{ seq: 2, event: agentMessage("b", "b") }], {
				as: box,
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

describe("stored chats of a sleeping cloud workspace", () => {
	test("a cloud box's chat can be read back, a computer's cannot", async () => {
		const cloudChat = newSession();
		await push(
			cloudChat,
			[{ seq: 1, event: agentMessage("a1", "from the box") }],
			{
				workspaceId: MY_CLOUD,
			},
		);
		const laptopChat = newSession();
		await push(laptopChat, [
			{ seq: 1, event: agentMessage("b1", "from a laptop") },
		]);

		const stored = await owner.ofWorkspace({ workspaceId: MY_CLOUD });
		expect(stored.map((chat) => chat.id)).toContain(cloudChat);
		const page = await owner.events({ chatSessionId: cloudChat });
		expect(page.epoch).toBe("epoch-1");
		expect(page.events.map(({ event }) => event.type)).toEqual(["item"]);

		expect(await owner.ofWorkspace({ workspaceId: WORKSPACE })).toEqual([]);
		expect(await owner.events({ chatSessionId: laptopChat })).toEqual({
			epoch: null,
			events: [],
			nextAfterSeq: null,
			nextBeforeSeq: null,
		});
	});

	test("a long stored chat pages from its newest events, each with its turn", async () => {
		const chat = newSession();
		await push(
			chat,
			[
				{
					seq: 1,
					event: {
						type: "turn",
						turn: { id: "turn-1", status: "completed", startedAtMs: 1 },
					} as DurableEvent,
				},
				{ seq: 2, event: agentMessage("a1", "first") },
				{ seq: 3, event: agentMessage("a2", "second") },
				{ seq: 4, event: agentMessage("a3", "third") },
			],
			{ workspaceId: MY_CLOUD },
		);

		const newest = await owner.events({
			chatSessionId: chat,
			latest: true,
			limit: 2,
		});
		expect(newest.events.map(({ seq }) => seq)).toEqual([1, 3, 4]);
		expect(newest.nextBeforeSeq).toBe(3);

		const older = await owner.events({
			chatSessionId: chat,
			latest: true,
			beforeSeq: 3,
			limit: 5,
		});
		expect(older.events.map(({ seq }) => seq)).toEqual([1, 2]);
		expect(older.nextBeforeSeq).toBeNull();
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

type HostCall = { workspaceId: string; procedure: string; input: unknown };

function fakeHosts(failOn?: string) {
	const calls: HostCall[] = [];
	return {
		calls,
		hostFor: async ({
			workspaceId,
			hostId,
		}: {
			workspaceId: string;
			hostId: string | null;
		}) => ({
			kind: hostId ? ("computer" as const) : ("cloud" as const),
			mutation: async <T>(procedure: string, input: object) => {
				calls.push({ workspaceId, procedure, input });
				if (procedure === failOn) throw new Error(`${procedure}: disk full`);
				return {} as T;
			},
		}),
	};
}

async function storeBundle(sessionId: string) {
	const [file] = await db
		.insert(files)
		.values({
			organizationId: ORG,
			name: "harness-1.tar.gz",
			contentType: "application/gzip",
			sizeBytes: 10,
			sha256: "a".repeat(64),
			status: "ready",
			createdByUserId: USER,
		})
		.returning({ id: files.id });
	if (!file) throw new Error("no file");
	fileIds.push(file.id);
	await db.insert(chatTranscripts).values({
		sessionId,
		organizationId: ORG,
		fileId: file.id,
		harness: "claude-acp",
		harnessSessionId: "harness-1",
		sourceCwd: "/laptop/repo",
		byteLength: 10,
		sha256: "a".repeat(64),
	});
}

async function moveOf(id: string) {
	const { move } = await callMoves(ORG, { op: "chatMove", id });
	if (!move) throw new Error(`no move ${id}`);
	return move;
}

async function loadWorkspaceMove(id: string) {
	return (await callMoves(ORG, { op: "workspaceMove", id })).move;
}

async function chatOnLaptop() {
	const sessionId = newSession();
	await push(sessionId, [
		{ seq: 1, event: agentMessage("a", "first") },
		{ seq: 2, event: agentMessage("b", "second") },
	]);
	await storeBundle(sessionId);
	return sessionId;
}

const BRANCH = "superset/teleport-test";

/** The workspace a stored chat is in now; WORKSPACE for one never synced. */
async function workspaceOf(sessionId: string): Promise<string> {
	const session = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, sessionId),
		columns: { v2WorkspaceId: true },
	});
	return session?.v2WorkspaceId ?? WORKSPACE;
}

type MoveInput = {
	organizationId: string;
	userId: string;
	fromWorkspaceId: string;
	fromHostId?: string;
	toHostId?: string;
	toWorkspaceId: string;
	branch?: string;
	chatSessionIds: string[];
};

/** Begins and attaches a workspace move, as the desktop does; a move it cannot attach is abandoned. */
async function createWorkspaceMove(input: MoveInput) {
	const { workspaceMoveId } = await beginWorkspaceMove({
		organizationId: input.organizationId,
		userId: input.userId,
		fromWorkspaceId: input.fromWorkspaceId,
		...(input.fromHostId ? { fromHostId: input.fromHostId } : {}),
		...(input.toHostId ? { toHostId: input.toHostId } : {}),
	});
	try {
		const attached = await attachWorkspaceMove({
			organizationId: input.organizationId,
			userId: input.userId,
			workspaceMoveId,
			toWorkspaceId: input.toWorkspaceId,
			branch: input.branch ?? BRANCH,
			chatSessionIds: input.chatSessionIds,
		});
		return { workspaceMoveId, ...attached };
	} catch (error) {
		await abandonWorkspaceMove({
			organizationId: input.organizationId,
			userId: input.userId,
			workspaceMoveId,
			error: String(error),
		});
		throw error;
	}
}

/** One chat's move: a workspace move of that chat alone. */
async function createChatMove(
	input: Omit<MoveInput, "fromWorkspaceId" | "chatSessionIds"> & {
		chatSessionId: string;
	},
) {
	const { chatSessionId, ...rest } = input;
	const { moves, skipped } = await createWorkspaceMove({
		...rest,
		fromWorkspaceId: await workspaceOf(chatSessionId),
		chatSessionIds: [chatSessionId],
	});
	const move = moves[0];
	if (!move) throw new Error(skipped[0]?.reason ?? "no move recorded");
	return move;
}

/** The same through the API, as the desktop on a computer calls it. */
async function startWorkspaceMove(
	input: Omit<MoveInput, "organizationId" | "userId">,
	caller = routerFor(USER),
) {
	const { workspaceMoveId } = await caller.workspaceMove.begin({
		fromWorkspaceId: input.fromWorkspaceId,
		...(input.fromHostId ? { fromHostId: input.fromHostId } : {}),
		...(input.toHostId ? { toHostId: input.toHostId } : {}),
	});
	try {
		const attached = await caller.workspaceMove.attach({
			workspaceMoveId,
			toWorkspaceId: input.toWorkspaceId,
			branch: input.branch ?? BRANCH,
			chatSessionIds: input.chatSessionIds,
		});
		return { workspaceMoveId, ...attached };
	} catch (error) {
		await caller.workspaceMove.abandon({
			workspaceMoveId,
			error: String(error),
		});
		throw error;
	}
}

async function startOne(
	input: Omit<
		MoveInput,
		"organizationId" | "userId" | "fromWorkspaceId" | "chatSessionIds"
	> & {
		chatSessionId: string;
	},
) {
	const { chatSessionId, ...rest } = input;
	const started = await startWorkspaceMove({
		...rest,
		fromWorkspaceId: await workspaceOf(chatSessionId),
		chatSessionIds: [chatSessionId],
	});
	const moveId = started.moves[0]?.moveId;
	if (!moveId) throw new Error(started.skipped[0]?.reason ?? "no move started");
	return { moveId, runsOnThisComputer: started.runsOnThisComputer };
}

async function workspaceMoveOf(moveId: string) {
	const move = await moveOf(moveId);
	const parent = await loadWorkspaceMove(move.workspaceMoveId);
	if (!parent) throw new Error(`no workspace move for ${moveId}`);
	return parent;
}

describe("workspace moves", () => {
	beforeEach(() => {
		WORKSPACE = crypto.randomUUID();
	});

	test("settle from their chats: partial while one failed, ready once its retry lands", async () => {
		const first = await chatOnLaptop();
		const second = await chatOnLaptop();
		const started = await startWorkspaceMove({
			fromWorkspaceId: WORKSPACE,
			branch: BRANCH,
			chatSessionIds: [first, second],
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		const [one, two] = started.moves;
		if (!one || !two) throw new Error("expected two moves");
		const mover = routerFor(USER).chatMove;
		await mover.claim({ moveId: one.moveId });
		await mover.claim({ moveId: two.moveId });
		expect((await workspaceMoveOf(one.moveId)).status).toBe("moving");

		await mover.fail({ moveId: one.moveId, error: "import failed" });
		await completeChatMove(await moveOf(two.moveId), fakeHosts(), {
			kind: "computer",
		});
		expect(await workspaceMoveOf(one.moveId)).toMatchObject({
			status: "partial",
			branch: BRANCH,
		});

		const retried = await mover.retry({ moveId: one.moveId });
		expect((await workspaceMoveOf(retried.moveId)).id).toBe(
			(await workspaceMoveOf(one.moveId)).id,
		);
		expect((await workspaceMoveOf(retried.moveId)).status).toBe("moving");
		await mover.claim({ moveId: retried.moveId });
		await completeChatMove(await moveOf(retried.moveId), fakeHosts(), {
			kind: "computer",
		});
		const latest = await routerFor(USER).workspaceMove.latest({
			workspaceId: WORKSPACE,
		});
		expect(latest).toMatchObject({
			status: "ready",
			toWorkspaceId: DESKTOP_WORKSPACE,
			chats: { total: 2, ready: 2, failed: 0 },
		});
	});

	test("a workspace with no chats to move is recorded, and done once its destination is", async () => {
		const workspaceId = crypto.randomUUID();
		const started = await startWorkspaceMove({
			fromWorkspaceId: workspaceId,
			branch: BRANCH,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
		});
		expect(started.moves).toEqual([]);
		expect(
			await routerFor(USER).workspaceMove.latest({ workspaceId }),
		).toMatchObject({ status: "ready", chats: { total: 0 } });
	});

	test("one move per workspace at a time", async () => {
		const sessionId = await chatOnLaptop();
		const input = {
			fromWorkspaceId: WORKSPACE,
			branch: BRANCH,
			chatSessionIds: [sessionId],
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		};
		const started = await startWorkspaceMove(input);
		await expect(
			startWorkspaceMove({ ...input, chatSessionIds: [] }),
		).rejects.toThrow("already moving");
		await routerFor(USER).chatMove.fail({
			moveId: started.moves[0]?.moveId as string,
			error: "import failed",
		});
	});

	test("fails with its cloud workspace, chats or not", async () => {
		const emptyWorkspace = crypto.randomUUID();
		const { workspaceMoveId } = await createWorkspaceMove({
			fromWorkspaceId: emptyWorkspace,
			branch: BRANCH,
			chatSessionIds: [],
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		await failChatMovesTo(MY_CLOUD, "The cloud workspace could not start");
		expect(await loadWorkspaceMove(workspaceMoveId)).toMatchObject({
			status: "failed",
			error: "The cloud workspace could not start",
		});
		expect((await workspaceMoveOf(move.id)).status).toBe("failed");
	});
});

describe("workspace move safety", () => {
	beforeEach(() => {
		WORKSPACE = crypto.randomUUID();
	});

	async function failedToDesktop() {
		const sessionId = await chatOnLaptop();
		const { moveId } = await startOne({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		const mover = routerFor(USER).chatMove;
		await mover.claim({ moveId });
		await mover.fail({ moveId, error: "import failed" });
		return { sessionId, moveId, mover };
	}

	test("a workspace move whose chats all failed carries the first error", async () => {
		const { moveId } = await failedToDesktop();
		expect(await workspaceMoveOf(moveId)).toMatchObject({
			status: "failed",
			error: "import failed",
		});
	});

	test("a retry is refused while the workspace is moving again", async () => {
		const { moveId, mover } = await failedToDesktop();
		await routerFor(USER).workspaceMove.begin({ fromWorkspaceId: WORKSPACE });
		await expect(mover.retry({ moveId })).rejects.toThrow("moving again");
	});

	test("a retry is refused once the chat left the workspace that moved", async () => {
		const { sessionId, moveId, mover } = await failedToDesktop();
		await db
			.update(chatSessions)
			.set({ v2WorkspaceId: crypto.randomUUID() })
			.where(eq(chatSessions.id, sessionId));
		await expect(mover.retry({ moveId })).rejects.toThrow(
			"no longer in the workspace it moved from",
		);
	});

	test("a retry is refused when the cloud workspace it went to is gone", async () => {
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		await callMoves(ORG, { op: "fail", id: move.id, error: "lost" });
		await db
			.update(cloudWorkspaces)
			.set({ status: "failed" })
			.where(eq(cloudWorkspaces.id, MY_CLOUD));
		try {
			await expect(
				routerFor(USER).chatMove.retry({ moveId: move.id }),
			).rejects.toThrow("is gone");
		} finally {
			await db
				.update(cloudWorkspaces)
				.set({ status: "ready" })
				.where(eq(cloudWorkspaces.id, MY_CLOUD));
		}
	});

	test("a chat waiting its turn is not failed while its workspace move goes on", async () => {
		const first = await chatOnLaptop();
		const second = await chatOnLaptop();
		const started = await startWorkspaceMove({
			fromWorkspaceId: WORKSPACE,
			chatSessionIds: [first, second],
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		const waiting = started.moves.find((move) => move.chatSessionId === second);
		backdateMove("chat_moves", waiting?.moveId as string);
		await routerFor(USER).chatMove.latest({ chatSessionId: second });
		expect((await moveOf(waiting?.moveId as string)).status).toBe("pending");

		backdateMove("workspace_moves", started.workspaceMoveId);
		await routerFor(USER).chatMove.latest({ chatSessionId: second });
		expect((await moveOf(waiting?.moveId as string)).status).toBe("failed");
	});

	test("a workspace cannot begin moving without the workspace-moves flag", async () => {
		movesFlag = undefined;
		try {
			await expect(
				routerFor(USER).workspaceMove.begin({ fromWorkspaceId: WORKSPACE }),
			).rejects.toThrow("not enabled");
		} finally {
			movesFlag = true;
		}
	});

	test("an abandoned move frees the workspace to move again", async () => {
		const mover = routerFor(USER).workspaceMove;
		const { workspaceMoveId } = await mover.begin({
			fromWorkspaceId: WORKSPACE,
		});
		await expect(mover.begin({ fromWorkspaceId: WORKSPACE })).rejects.toThrow(
			"already moving",
		);
		await mover.abandon({ workspaceMoveId, error: "push failed" });
		expect(await loadWorkspaceMove(workspaceMoveId)).toMatchObject({
			status: "failed",
			error: "push failed",
		});
		await mover.begin({ fromWorkspaceId: WORKSPACE });
	});
});

describe("chat moves", () => {
	beforeEach(() => {
		WORKSPACE = crypto.randomUUID();
	});

	test("a workspace moves all its chats together, each as its own move", async () => {
		const first = await chatOnLaptop();
		const second = await chatOnLaptop();
		const mover = routerFor(USER).chatMove;
		const started = await startWorkspaceMove({
			fromWorkspaceId: WORKSPACE,
			branch: BRANCH,
			chatSessionIds: [first, second],
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		expect(started.runsOnThisComputer).toBe(true);
		expect(started.moves.map((move) => move.chatSessionId).sort()).toEqual(
			[first, second].sort(),
		);
		for (const { moveId } of started.moves) {
			expect(await moveOf(moveId)).toMatchObject({
				status: "pending",
				toWorkspaceId: DESKTOP_WORKSPACE,
				fromWorkspaceId: WORKSPACE,
			});
		}

		const [one] = started.moves;
		await mover.claim({ moveId: one?.moveId as string });
		await mover.fail({ moveId: one?.moveId as string, error: "import failed" });
		const other = started.moves.find((move) => move !== one);
		expect((await moveOf(other?.moveId as string)).status).toBe("pending");
	});

	test("a computer that never registered still moves its chats, and is recorded as the source", async () => {
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: `unregistered-${crypto.randomUUID()}`,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		expect(await moveOf(move.id)).toMatchObject({
			fromWorkspaceId: WORKSPACE,
			fromHostId: expect.stringMatching(/^unregistered-/),
			status: "pending",
		});
	});

	test("a chat from another workspace, or with no session bundle, is skipped and the rest move", async () => {
		const onLaptop = await chatOnLaptop();
		const inCloud = newSession();
		await push(inCloud, [{ seq: 1, event: agentMessage("a", "a") }], {
			as: callerFor(USER, MY_CLOUD),
			workspaceId: MY_CLOUD,
		});
		await storeBundle(inCloud);
		const noBundle = newSession();
		await push(noBundle, [{ seq: 1, event: agentMessage("a", "a") }]);
		const started = await startWorkspaceMove({
			fromWorkspaceId: WORKSPACE,
			chatSessionIds: [onLaptop, inCloud, noBundle],
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		expect(started.moves.map((move) => move.chatSessionId)).toEqual([onLaptop]);
		expect(started.skipped).toEqual([
			{
				chatSessionId: inCloud,
				reason: "This chat is not in the workspace that moves",
			},
			{
				chatSessionId: noBundle,
				reason: "The chat's session files were not uploaded first",
			},
		]);
	});

	test("into a cloud workspace: the job hands the chat over, switches it, then starts it and stops the old copy", async () => {
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		expect(move.toHostId).toBeNull();
		const hosts = fakeHosts();

		expect(
			await runChatMove({ organizationId: ORG, moveId: move.id }, hosts),
		).toBe("ready");
		expect(
			await runChatMove({ organizationId: ORG, moveId: move.id }, hosts),
		).toBe("skipped");

		expect(
			hosts.calls.map((call) => [call.workspaceId, call.procedure]),
		).toEqual([
			[MY_CLOUD, "teleport.importChat"],
			[MY_CLOUD, "teleport.continueChat"],
			[WORKSPACE, "teleport.markMoved"],
		]);
		const imported = hosts.calls[0]?.input as {
			events: { seq: number }[];
			session: { lastSeq: number; epoch: string };
			bundle: { sha256: string };
		};
		expect(imported.events.map((row) => row.seq)).toEqual([1, 2]);
		expect(imported.session).toMatchObject({ lastSeq: 2, epoch: "epoch-1" });
		expect(imported.bundle.sha256).toBe("a".repeat(64));
		expect(hosts.calls[2]?.input).toMatchObject({ destination: "cloud" });

		expect((await moveOf(move.id)).status).toBe("ready");
		expect((await history(sessionId)).session.v2WorkspaceId).toBe(MY_CLOUD);
		await expect(
			push(sessionId, [{ seq: 3, event: agentMessage("c", "c") }]),
		).rejects.toThrow("moved to another workspace");
	});

	test("to a computer: the desktop there claims it and pages the history; nothing is queued", async () => {
		const sessionId = await chatOnLaptop();
		const mover = routerFor(USER).chatMove;
		const started = await startOne({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		expect(started.runsOnThisComputer).toBe(true);
		expect((await moveOf(started.moveId)).status).toBe("pending");

		const claimed = await mover.claim({ moveId: started.moveId });
		expect(claimed).toMatchObject({
			workspaceId: DESKTOP_WORKSPACE,
			chatSessionId: sessionId,
		});
		expect(claimed).not.toHaveProperty("events");
		await expect(mover.claim({ moveId: started.moveId })).rejects.toThrow(
			"already started",
		);
		const first = await mover.events({ moveId: started.moveId, limit: 1 });
		const rest = await mover.events({
			moveId: started.moveId,
			afterSeq: first.nextAfterSeq ?? 0,
		});
		expect([...first.events, ...rest.events].map((row) => row.seq)).toEqual([
			1, 2,
		]);
		expect(rest.nextAfterSeq).toBeNull();

		const hosts = fakeHosts();
		await completeChatMove(await moveOf(started.moveId), hosts, {
			kind: "computer",
		});
		expect(
			hosts.calls.map((call) => [call.workspaceId, call.procedure]),
		).toEqual([[WORKSPACE, "teleport.markMoved"]]);
		expect((await history(sessionId)).session.v2WorkspaceId).toBe(
			DESKTOP_WORKSPACE,
		);
		expect((await mover.latest({ chatSessionId: sessionId }))?.status).toBe(
			"ready",
		);
	});

	test("refuses a teammate's cloud workspace, a box, an unknown host, and a second move", async () => {
		const sessionId = await chatOnLaptop();
		const target = {
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			organizationId: ORG,
			userId: USER,
		};
		await expect(
			createChatMove({ ...target, toWorkspaceId: THEIR_CLOUD }),
		).rejects.toThrow("cloud workspace you started");
		await expect(
			routerFor(USER, MY_CLOUD).workspaceMove.begin({
				fromWorkspaceId: WORKSPACE,
				toHostId: DESKTOP,
			}),
		).rejects.toThrow("A cloud workspace cannot");
		await expect(
			createChatMove({ ...target, toWorkspaceId: DESKTOP_WORKSPACE }),
		).rejects.toThrow("not where this move goes");
		await expect(
			createChatMove({
				...target,
				toWorkspaceId: DESKTOP_WORKSPACE,
				toHostId: THEIR_HOST,
			}),
		).rejects.toThrow("Host not found");

		await createChatMove({ ...target, toWorkspaceId: MY_CLOUD });
		await expect(
			createChatMove({ ...target, toWorkspaceId: MY_CLOUD }),
		).rejects.toThrow("already moving");
		await expect(
			push(sessionId, [{ seq: 3, event: agentMessage("c", "c") }], {
				as: callerFor(USER, MY_CLOUD),
				workspaceId: MY_CLOUD,
			}),
		).rejects.toThrow("still moving");
	});

	test("a failed move leaves the chat where it was, and can be tried again", async () => {
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		const hosts = fakeHosts("teleport.importChat");
		expect(
			await runChatMove({ organizationId: ORG, moveId: move.id }, hosts),
		).toBe("failed");
		expect(hosts.calls.map((call) => call.procedure)).toEqual([
			"teleport.importChat",
		]);
		const failed = await moveOf(move.id);
		expect(failed.status).toBe("failed");
		expect(failed.error).toContain("disk full");
		expect((await history(sessionId)).session.v2WorkspaceId).toBe(WORKSPACE);
		await push(sessionId, [{ seq: 3, event: agentMessage("c", "c") }]);

		const mover = routerFor(USER).chatMove;
		const toDesktop = await startOne({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		await mover.claim({ moveId: toDesktop.moveId });
		await mover.fail({ moveId: toDesktop.moveId, error: "import failed" });
		expect((await moveOf(toDesktop.moveId)).status).toBe("failed");
		const retried = await mover.retry({ moveId: toDesktop.moveId });
		expect(retried).toMatchObject({ runsOnThisComputer: true });
		expect(retried.moveId).not.toBe(toDesktop.moveId);
	});

	test("the box a chat left is told the chat moved", async () => {
		const sessionId = newSession();
		const box = callerFor(USER, MY_CLOUD);
		await push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }], {
			as: box,
			workspaceId: MY_CLOUD,
		});
		await storeBundle(sessionId);
		const move = await createChatMove({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			organizationId: ORG,
			userId: USER,
		});
		await routerFor(USER).chatMove.claim({ moveId: move.id });
		await completeChatMove(await moveOf(move.id), fakeHosts(), {
			kind: "computer",
		});

		await expect(
			push(sessionId, [{ seq: 2, event: agentMessage("b", "b") }], {
				as: box,
				workspaceId: MY_CLOUD,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	test("a box takes over a chat an automation recorded without a workspace", async () => {
		const sessionId = newSession();
		await db.insert(chatSessions).values({
			id: sessionId,
			organizationId: ORG,
			createdBy: USER,
			v2WorkspaceId: null,
		});
		const box = callerFor(USER, MY_CLOUD);
		await withMoveStore(
			async () => {
				throw new Error("the move store is down");
			},
			() =>
				push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }], {
					as: box,
					workspaceId: MY_CLOUD,
				}),
		);
		const [row] = await db
			.select({ v2WorkspaceId: chatSessions.v2WorkspaceId })
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId));
		expect(row?.v2WorkspaceId).toBe(MY_CLOUD);
	});

	test("a push asks to try again, not fails, while the move store is down", async () => {
		const sessionId = newSession();
		await push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }]);
		await expect(
			withMoveStore(
				async () => {
					throw new Error("the move store is down");
				},
				() =>
					push(sessionId, [{ seq: 2, event: agentMessage("b", "b") }], {
						as: callerFor(USER, MY_CLOUD),
						workspaceId: MY_CLOUD,
					}),
			),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	});

	test("a finish whose answer was lost fails the move, and the chat stays", async () => {
		const sessionId = newSession();
		const box = callerFor(USER, MY_CLOUD);
		await push(sessionId, [{ seq: 1, event: agentMessage("a", "a") }], {
			as: box,
			workspaceId: MY_CLOUD,
		});
		await storeBundle(sessionId);
		const move = await createChatMove({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			organizationId: ORG,
			userId: USER,
		});
		await routerFor(USER).chatMove.claim({ moveId: move.id });
		await expect(
			withMoveStore(
				async (organizationId, request) => {
					const response = await localMoves(organizationId, request);
					if (request.op === "finish") throw new Error("answer lost");
					return response;
				},
				async () =>
					completeChatMove(await moveOf(move.id), fakeHosts(), {
						kind: "computer",
					}),
			),
		).rejects.toThrow();
		expect((await moveOf(move.id)).status).toBe("failed");
		const [row] = await db
			.select({ v2WorkspaceId: chatSessions.v2WorkspaceId })
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId));
		expect(row?.v2WorkspaceId).toBe(MY_CLOUD);
	});

	test("a retry refuses a chat that went on after the failed move began", async () => {
		const sessionId = await chatOnLaptop();
		const mover = routerFor(USER).chatMove;
		const first = await startOne({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
			fromHostId: LAPTOP,
		});
		await mover.claim({ moveId: first.moveId });
		await mover.fail({ moveId: first.moveId, error: "import failed" });
		await push(sessionId, [
			{
				seq: 3,
				event: {
					type: "turn",
					turn: { id: "turn-2", status: "running", startedAtMs: 2 },
				} as DurableEvent,
			},
		]);

		const retried = await mover.retry({ moveId: first.moveId });
		await expect(mover.claim({ moveId: retried.moveId })).rejects.toThrow(
			"went on in its old workspace",
		);
	});

	test("refuses a chat that went on in its old workspace after the move began", async () => {
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		await push(sessionId, [
			{
				seq: 3,
				event: {
					type: "turn",
					turn: { id: "turn-2", status: "running", startedAtMs: 2 },
				} as DurableEvent,
			},
		]);
		await expect(buildChatImport(await moveOf(move.id))).rejects.toThrow(
			"went on in its old workspace",
		);
	});

	test("a move that stopped answering shows as failed, so the chat can move again", async () => {
		const sessionId = await chatOnLaptop();
		const move = await createChatMove({
			chatSessionId: sessionId,
			fromHostId: LAPTOP,
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		backdateMove("chat_moves", move.id);
		backdateMove("workspace_moves", (await moveOf(move.id)).workspaceMoveId);
		const latest = await routerFor(USER).chatMove.latest({
			chatSessionId: sessionId,
		});
		expect(latest).toMatchObject({ status: "failed" });
		expect(latest?.error).toContain("stopped answering");
	});
});
