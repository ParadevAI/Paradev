import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("../publish", () => ({ publishChats: () => {} }));

const { db, dbWs } = await import("@superset/db/client");
const { chatsMessages, chatsModelUsage, members, organizations, users } =
	await import("@superset/db/schema");
const { asc, eq, inArray } = await import("drizzle-orm");
const { chatsRouter } = await import("../chats");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../../trpc");
const { handleBoxRequest } = await import("./box-api");
const { generateBoxKeys } = await import("./box-tokens");
const { inlineTurnRuns } = await import("./inline-runs");
const { setChatsTurnRuntime } = await import("./runtime");

type TurnDeps = import("./engine").TurnDeps;
type TurnStart = import("./boxes").TurnStart;
type Box = import("./boxes").Box;

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const suffix = Date.now();
const keys = await generateBoxKeys();

const owner = createCallerFactory(createTRPCRouter({ chats: chatsRouter }))(
	createTRPCContext({
		session: {
			user: { id: OWNER, email: `${OWNER}@example.com` },
			session: { activeOrganizationId: ORG },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	}),
);

const started: TurnStart[] = [];
/** Each Dev's box and the credential its proxy would add. */
const boxes = new Map<string, { box: Box; credential: string }>();
let runs: ReturnType<typeof inlineTurnRuns>;
let deps: TurnDeps;
let upstream: { url: string; key: string | null }[] = [];

async function startedTurn(count: number): Promise<TurnStart> {
	for (let tries = 0; tries < 400 && started.length < count; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	const turn = started[count - 1];
	if (!turn) throw new Error(`turn ${count} never reached the runner`);
	return turn;
}

/** A request as the box's proxy would send it. */
const fromBox = (
	turn: TurnStart,
	path: string,
	body: unknown,
	credential = boxes.get(turn.agentId)?.credential ?? "",
) =>
	handleBoxRequest(
		{
			keys,
			turns: deps,
			gatewayKey: "gateway-key",
			fetch: (async (url: string, init: RequestInit) => {
				upstream.push({
					url,
					key: new Headers(init.headers).get("x-api-key"),
				});
				return new Response(
					JSON.stringify({ usage: { input_tokens: 7, output_tokens: 3 } }),
					{ headers: { "content-type": "application/json" } },
				);
			}) as unknown as typeof fetch,
		},
		new Request(`http://api.test${path}`, {
			method: "POST",
			headers: {
				"x-dev-box": credential,
				"x-dev-chat": turn.groupId,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		}),
		path,
	);

async function messaged(text: string) {
	const { group } = await owner.chats.createDev({
		organizationId: ORG,
		name: `Dev ${started.length}-${Math.random().toString(36).slice(2, 6)}`,
		color: "#F2B23E",
		description: "Answers",
	});
	await owner.chats.sendMessage({ groupId: group.id, text });
	return { groupId: group.id, turn: await startedTurn(started.length + 1) };
}

beforeAll(async () => {
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Box Org", slug: `box-org-${suffix}` });
	await db.insert(users).values({
		id: OWNER,
		name: "Owner",
		email: `box-${suffix}@example.com`,
		organizationIds: [ORG],
	});
	await db.insert(members).values({
		id: crypto.randomUUID(),
		organizationId: ORG,
		userId: OWNER,
		role: "member",
		createdAt: new Date(),
	});
});

beforeEach(() => {
	upstream = [];
	runs = inlineTurnRuns(() => deps);
	deps = {
		boxes: {
			wake: async (agentId, { boxId, credential }) => {
				const box = { id: boxId, url: "http://box.test" };
				boxes.set(agentId, { box, credential });
				return box;
			},
			status: async (agentId) => boxes.get(agentId)?.box ?? null,
			stop: async (agentId) => {
				boxes.delete(agentId);
			},
		},
		runner: {
			start: async (_box, turn) => {
				started.push(turn);
			},
			cancel: async () => {},
		},
		turnRuns: runs,
		boxKeys: async () => keys,
		boxApiUrl: "http://api.test",
		fauxModel: true,
		idleTimeoutMs: 60_000,
	};
	setChatsTurnRuntime(deps);
});

afterAll(async () => {
	setChatsTurnRuntime(null);
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(inArray(users.id, [OWNER]));
	await dbWs.$client.end?.().catch(() => {});
});

test("a box replies and settles its Dev's turn, and the turn is given the chat", async () => {
	const { groupId, turn } = await messaged("hello");
	expect(turn.chat.roster).toContain("custom Dev");
	expect((await fromBox(turn, "/cli/reply", { text: "hi back" })).status).toBe(
		201,
	);
	const settled = await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
		answer: "",
	});
	expect(settled.status).toBe(204);
	await runs.idle();
	const rows = await db
		.select({ text: chatsMessages.text, agent: chatsMessages.authorAgentId })
		.from(chatsMessages)
		.where(eq(chatsMessages.groupId, groupId))
		.orderBy(asc(chatsMessages.createdAt));
	expect(rows).toEqual([
		{ text: "hello", agent: null },
		{ text: "hi back", agent: turn.agentId },
	]);
	expect((await fromBox(turn, "/cli/reply", { text: "again" })).status).toBe(
		403,
	);
});

test("only the current box of the turn's Dev is let in", async () => {
	const first = await messaged("one");
	const second = await messaged("two");
	const others = boxes.get(second.turn.agentId)?.credential;
	expect(
		(await fromBox(first.turn, "/cli/reply", { text: "x" }, "not-a-token"))
			.status,
	).toBe(401);
	expect(
		(await fromBox(first.turn, "/cli/reply", { text: "x" }, others)).status,
	).toBe(403);
	expect(
		(
			await fromBox(first.turn, `/cli/turns/${second.turn.turnId}/settled`, {
				stopReason: "end_turn",
			})
		).status,
	).toBe(403);
	for (const { turn } of [first, second]) {
		await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
			stopReason: "end_turn",
		});
	}
	await runs.idle();
});

test("a box's model call goes out with the server's key and is metered to the Dev's owner", async () => {
	const { turn } = await messaged("think");
	const response = await fromBox(turn, "/model/v1/messages", {
		model: "anthropic/claude-sonnet-5.5",
		messages: [],
	});
	expect(response.status).toBe(200);
	expect(upstream).toEqual([
		{ url: "https://ai-gateway.vercel.sh/v1/messages", key: "gateway-key" },
	]);
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
	let usage: (typeof chatsModelUsage.$inferSelect)[] = [];
	for (let tries = 0; tries < 100 && usage.length === 0; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 20));
		usage = await db
			.select()
			.from(chatsModelUsage)
			.where(eq(chatsModelUsage.agentId, turn.agentId));
	}
	expect(
		usage.map((row) => [
			row.userId,
			row.model,
			row.inputTokens,
			row.outputTokens,
		]),
	).toEqual([[OWNER, "anthropic/claude-sonnet-5.5", 7, 3]]);
});
