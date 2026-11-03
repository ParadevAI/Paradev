import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DurableEvent } from "@superset/chat/protocol";

const { db } = await import("@superset/db/client");
const {
	chatMoves,
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
const { eq, inArray } = await import("drizzle-orm");
const { chatHistoryRouter } = await import("./chat-history");
const { loadChatHistory } = await import("./utils/loadChatHistory");
const { chatMoveRouter } = await import("../chat-move");
const { createChatMove } = await import("../chat-move/utils/createChatMove");
const { buildChatImport, completeChatMove, runChatMove } = await import(
	"../chat-move/utils/runChatMove"
);
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const CLOUD_WORKSPACE = crypto.randomUUID();
const LAPTOP = `laptop-${crypto.randomUUID()}`;
const DESKTOP = `desktop-${crypto.randomUUID()}`;
const DESKTOP_WORKSPACE = crypto.randomUUID();
const suffix = Date.now();
const sessions: string[] = [];
const fileIds: string[] = [];

const MY_CLOUD = crypto.randomUUID();
const THEIR_CLOUD = crypto.randomUUID();

const createCaller = createCallerFactory(
	createTRPCRouter({
		chatHistory: chatHistoryRouter,
		chatMove: chatMoveRouter,
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
	]);
	await db.insert(v2UsersHosts).values([
		{ organizationId: ORG, userId: USER, hostId: LAPTOP },
		{ organizationId: ORG, userId: USER, hostId: DESKTOP },
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
		await push(sessionId, [{ seq: 1, event: agentMessage("old", "old") }]);
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
		const text = "Fixed packages/chat-runtime/src/harness/acp/acpAdapter.ts";
		await push(first, [{ seq: 1, event: agentMessage("x", text) }]);
		await push(copy, [{ seq: 1, event: agentMessage("y", text) }]);
		await push(unrelated, [
			{ seq: 1, event: agentMessage("z", "Nothing relevant here") },
		]);

		const results = await owner.search({ query: "acpAdapter" });
		const ids = results.map((row) => row.sessionId);
		expect(ids.filter((id) => id === first || id === copy)).toHaveLength(1);
		expect(ids).not.toContain(unrelated);
		expect(results[0]?.snippet).toContain("acpAdapter");

		expect(await callerFor(OTHER_USER).search({ query: "acpAdapter" })).toEqual(
			[],
		);
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
	const move = await db.query.chatMoves.findFirst({
		where: eq(chatMoves.id, id),
	});
	if (!move) throw new Error(`no move ${id}`);
	return move;
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

describe("chat moves", () => {
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

		expect(await runChatMove(move.id, hosts)).toBe("ready");
		expect(await runChatMove(move.id, hosts)).toBe("skipped");

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
		const started = await mover.start({
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
			eventCount: 2,
		});
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
			organizationId: ORG,
			userId: USER,
		};
		await expect(
			createChatMove({ ...target, toWorkspaceId: THEIR_CLOUD }),
		).rejects.toThrow("cloud workspace you started");
		await expect(
			routerFor(USER, MY_CLOUD).chatMove.start({
				chatSessionId: sessionId,
				toWorkspaceId: DESKTOP_WORKSPACE,
				toHostId: DESKTOP,
			}),
		).rejects.toThrow("A cloud workspace cannot");
		await expect(
			createChatMove({ ...target, toWorkspaceId: DESKTOP_WORKSPACE }),
		).rejects.toThrow("Name the computer");
		await expect(
			createChatMove({
				...target,
				toWorkspaceId: DESKTOP_WORKSPACE,
				toHostId: "someone-elses-host",
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
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		const hosts = fakeHosts("teleport.importChat");
		expect(await runChatMove(move.id, hosts)).toBe("failed");
		expect(hosts.calls.map((call) => call.procedure)).toEqual([
			"teleport.importChat",
		]);
		const failed = await moveOf(move.id);
		expect(failed.status).toBe("failed");
		expect(failed.error).toContain("disk full");
		expect((await history(sessionId)).session.v2WorkspaceId).toBe(WORKSPACE);
		await push(sessionId, [{ seq: 3, event: agentMessage("c", "c") }]);

		const mover = routerFor(USER).chatMove;
		const toDesktop = await mover.start({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
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

	test("a retry refuses a chat that went on after the failed move began", async () => {
		const sessionId = await chatOnLaptop();
		const mover = routerFor(USER).chatMove;
		const first = await mover.start({
			chatSessionId: sessionId,
			toWorkspaceId: DESKTOP_WORKSPACE,
			toHostId: DESKTOP,
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
			toWorkspaceId: MY_CLOUD,
			organizationId: ORG,
			userId: USER,
		});
		await db
			.update(chatMoves)
			.set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
			.where(eq(chatMoves.id, move.id));
		const latest = await routerFor(USER).chatMove.latest({
			chatSessionId: sessionId,
		});
		expect(latest).toMatchObject({ status: "failed" });
		expect(latest?.error).toContain("stopped answering");
	});
});
