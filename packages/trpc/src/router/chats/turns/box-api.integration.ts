import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

mock.module("../publish", () => ({ publishChats: () => {} }));

const { db, dbWs } = await import("@superset/db/client");
const {
	chatsAppCalls,
	chatsMessages,
	chatsModelUsage,
	members,
	organizations,
	users,
} = await import("@superset/db/schema");
const { asc, eq, inArray } = await import("drizzle-orm");
const { chatsRouter } = await import("../chats");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../../trpc");
const { appCaller, paradevCaller, recordAppCall } = await import(
	"./app-access"
);
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
let dailyTokenLimit: number | undefined;

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
			dailyTokenLimit,
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
			busy: async () => false,
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
	// The same reply sent again in the turn is posted once.
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

test("one Dev asks another in its chat and hears the answer; the asked Dev posts nothing", async () => {
	const created = await owner.chats.createGroup({
		organizationId: ORG,
		title: "Asking",
	});
	const groupId = created.group.id;
	const mine = await owner.chats.createDev({
		organizationId: ORG,
		name: "Helper",
		color: "#F2B23E",
		description: "Knows things",
	});
	await owner.chats.addDevToGroup({ groupId, devId: mine.dev.id });
	const before = started.length;
	await owner.chats.sendMessage({
		groupId,
		text: `<@dev:${created.dev.id}> ask Helper`,
	});
	const turn = await startedTurn(before + 1);
	const asking = fromBox(turn, "/cli/ask", {
		dev: "helper",
		question: "what do you know",
	});
	const asked = await startedTurn(before + 2);
	expect(asked.agentId).toBe(mine.dev.id);
	expect(asked.devAsk).toBe(true);
	expect(asked.text).toContain("Question from Asking, a Dev in this chat");
	expect((await fromBox(asked, "/cli/reply", { text: "hi all" })).status).toBe(
		409,
	);
	await fromBox(asked, `/cli/turns/${asked.turnId}/settled`, {
		stopReason: "end_turn",
		answer: "plenty",
	});
	expect(await (await asking).json()).toEqual({ answer: "plenty" });
	expect(
		(await fromBox(turn, "/cli/ask", { dev: "nobody", question: "x" })).status,
	).toBe(404);
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});

const boxHeaders = (turn: TurnStart) =>
	new Headers({
		"x-dev-box": boxes.get(turn.agentId)?.credential ?? "",
		"x-dev-chat": turn.groupId,
	});
const refusal = (turn: TurnStart) =>
	paradevCaller(keys, boxHeaders(turn)).then(
		() => null,
		(error: { code: string }) => error.code,
	);

test("a Dev acts in Paradev as its owner only once the owner switched that on", async () => {
	const { groupId, turn } = await messaged("start a workspace");
	expect(turn.apps).toEqual([]);
	expect(await refusal(turn)).toBe("not_selected");

	await owner.chats.updateDev({ devId: turn.agentId, paradevAccess: true });
	const caller = await paradevCaller(keys, boxHeaders(turn));
	expect(caller).toMatchObject({
		agentId: turn.agentId,
		ownerUserId: OWNER,
		askedByUserId: OWNER,
		organizationId: ORG,
		groupId,
	});
	await recordAppCall(caller, {
		tool: "workspaces_create",
		ok: true,
		result: { workspace: { id: "ws-1" } },
	});
	expect(
		await db
			.select({ tool: chatsAppCalls.tool, asker: chatsAppCalls.askedByUserId })
			.from(chatsAppCalls)
			.where(eq(chatsAppCalls.agentId, turn.agentId)),
	).toEqual([{ tool: "workspaces_create", asker: OWNER }]);
	expect(await owner.chats.devWorkspaces({ organizationId: ORG })).toEqual([
		{ workspaceId: "ws-1", devId: turn.agentId },
	]);
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();

	const before = started.length;
	await owner.chats.sendMessage({ groupId, text: "again" });
	const next = await startedTurn(before + 1);
	expect(next.apps.map((app) => app.path)).toEqual(["apps/paradev/mcp"]);
	await fromBox(next, `/cli/turns/${next.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});

test("a group's Dev never acts in Paradev", async () => {
	const created = await owner.chats.createGroup({
		organizationId: ORG,
		title: "No access",
	});
	const groupTurns = started.length;
	await owner.chats.sendMessage({
		groupId: created.group.id,
		text: `<@dev:${created.dev.id}> start a workspace`,
	});
	const groupTurn = await startedTurn(groupTurns + 1);
	expect(await refusal(groupTurn)).toBe("no_apps");
	await expect(
		owner.chats.updateDev({ devId: created.dev.id, paradevAccess: true }),
	).rejects.toThrow();
	await fromBox(groupTurn, `/cli/turns/${groupTurn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});

test("work a Dev left running reports after its turn: the notice is a new turn that may reply", async () => {
	const { groupId, turn } = await messaged("build it");
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
	expect(
		(await fromBox(turn, "/cli/ask", { dev: "x", question: "y" })).status,
	).toBe(403);
	const before = started.length;
	expect(
		(await fromBox(turn, "/cli/notifications", { text: "the build passed" }))
			.status,
	).toBe(202);
	const noticed = await startedTurn(before + 1);
	expect(noticed.groupId).toBe(groupId);
	expect(noticed.text).toStartWith("## Background notice");
	expect(noticed.text).toContain("the build passed");
	expect(
		(await fromBox(noticed, "/cli/reply", { text: "Build passed." })).status,
	).toBe(201);
	await fromBox(noticed, `/cli/turns/${noticed.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});

test("a Dev's question is a card a person answers: the waiting turn hears it, and a late answer starts a turn", async () => {
	const fromBoxGet = (turn: TurnStart, path: string) =>
		handleBoxRequest(
			{ keys, turns: deps, gatewayKey: "gateway-key" },
			new Request(`http://api.test${path}`, {
				headers: {
					"x-dev-box": boxes.get(turn.agentId)?.credential ?? "",
					"x-dev-chat": turn.groupId,
				},
			}),
			path.split("?")[0] ?? path,
		);
	const { groupId, turn } = await messaged("which one?");
	const asked = await fromBox(turn, "/cli/questions", {
		kind: "select",
		title: "Tea or coffee?",
		options: [{ label: "Tea" }, { label: "Coffee" }],
	});
	expect(asked.status).toBe(201);
	const { question } = (await asked.json()) as { question: { id: string } };
	expect(
		await (
			await fromBoxGet(turn, `/cli/questions/${question.id}/answer?wait=0`)
		).json(),
	).toMatchObject({ status: "open" });
	await expect(
		owner.chats.answerQuestion({ questionId: question.id, answer: "Water" }),
	).rejects.toThrow("That isn't one of the options");
	await owner.chats.answerQuestion({ questionId: question.id, answer: "Tea" });
	expect(
		await (
			await fromBoxGet(turn, `/cli/questions/${question.id}/answer?wait=0`)
		).json(),
	).toMatchObject({ status: "answered", answer: "Tea" });
	await expect(
		owner.chats.answerQuestion({ questionId: question.id, answer: "Coffee" }),
	).rejects.toThrow("already answered");

	const second = await fromBox(turn, "/cli/questions", {
		kind: "confirm",
		title: "Ship it?",
	});
	const later = ((await second.json()) as { question: { id: string } }).question
		.id;
	expect(
		await (await fromBox(turn, `/cli/questions/${later}/release`, {})).json(),
	).toMatchObject({ status: "open" });
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
	const before = started.length;
	await owner.chats.answerQuestion({ questionId: later, answer: "yes" });
	const answerTurn = await startedTurn(before + 1);
	expect(answerTurn.groupId).toBe(groupId);
	expect(answerTurn.text).toStartWith("## Answer to your question");
	expect(answerTurn.text).toContain("You asked: Ship it?\nOwner said yes");
	await fromBox(answerTurn, `/cli/turns/${answerTurn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});

test("a plugin is its own switch on a Dev: off until its owner names it", async () => {
	const { turn } = await messaged("check my issues");
	const headers = new Headers({
		"x-dev-box": boxes.get(turn.agentId)?.credential ?? "",
		"x-dev-chat": turn.groupId,
	});
	const refusal = (plugin: string) =>
		appCaller(keys, headers, plugin).then(
			() => null,
			(error: { code: string }) => error.code,
		);
	expect(await refusal("linear")).toBe("not_selected");
	await owner.chats.updateDev({ devId: turn.agentId, plugins: ["linear"] });
	expect(await appCaller(keys, headers, "linear")).toMatchObject({
		app: "linear",
		ownerUserId: OWNER,
	});
	expect(await refusal("github")).toBe("not_selected");
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
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

	// The owner has now spent 10 tokens today: at a limit of 10, the next call is refused before it goes out.
	const next = await messaged("think again");
	dailyTokenLimit = 10;
	const refused = await fromBox(next.turn, "/model/v1/messages", {
		model: "anthropic/claude-sonnet-5.5",
		messages: [],
	});
	dailyTokenLimit = undefined;
	expect(refused.status).toBe(402);
	expect(upstream).toHaveLength(1);
	await fromBox(next.turn, `/cli/turns/${next.turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});

test("a Dev adds a follow-up for a person from its box and finds it in the chat's tasks", async () => {
	const { groupId, turn } = await messaged("remind me to call the venue");
	const added = await fromBox(turn, "/cli/tasks", {
		title: "Call the venue",
		assignee: "Owner",
		due: "2030-01-15 09:00",
		remind: true,
	});
	expect(added.status).toBe(201);
	const { task } = (await added.json()) as { task: { id: string } };
	const listed = await handleBoxRequest(
		{ keys, turns: deps },
		new Request("http://api.test/cli/tasks?status=open", {
			headers: boxHeaders(turn),
		}),
		"/cli/tasks",
	);
	expect(await listed.json()).toEqual({
		tasks: [
			{
				id: task.id,
				title: "Call the venue",
				description: "",
				status: "todo",
				due: null,
				scheduledAt: "2030-01-15T09:00:00.000Z",
				remind: true,
				assignee: "Owner",
			},
		],
		total: 1,
		nextOffset: null,
	});
	const refused = await fromBox(turn, "/cli/tasks", {
		title: "Standup",
		repeat: "every weekday at 9",
	});
	expect(refused.status).toBe(400);
	const boot = await owner.chats.bootstrap({ organizationId: ORG });
	expect(
		boot.messages.find((message) => message.taskId === task.id),
	).toMatchObject({ groupId, authorDevId: turn.agentId, turnId: turn.turnId });
	await owner.chats.deleteTask({ taskId: task.id });
	await fromBox(turn, `/cli/turns/${turn.turnId}/settled`, {
		stopReason: "end_turn",
	});
	await runs.idle();
});
