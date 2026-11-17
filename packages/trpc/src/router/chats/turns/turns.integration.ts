import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

const published: { type: string; status?: string; endsTurn?: boolean }[] = [];
mock.module("../publish", () => ({
	publishChats: (
		_channel: string,
		data: { type: string; status?: string; endsTurn?: boolean },
	) => {
		published.push({
			type: data.type,
			...(data.status ? { status: data.status } : {}),
			...(data.endsTurn ? { endsTurn: true } : {}),
		});
	},
}));

const { db, dbWs } = await import("@superset/db/client");
const { chatsMessages, members, organizations, users } = await import(
	"@superset/db/schema"
);
const { mentionToken } = await import("@superset/chats-core");
const { asc, eq, inArray } = await import("drizzle-orm");
const { chatsRouter } = await import("../chats");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../../trpc");
const { postDevMessage, settleTurn } = await import("./engine");
const { inlineTurnRuns } = await import("./inline-runs");
const { setChatsTurnRuntime } = await import("./runtime");
const { memoryBoxes } = await import("./scripted");
const { generateBoxKeys } = await import("./box-tokens");
const keys = generateBoxKeys();

type TurnDeps = import("./engine").TurnDeps;
type TurnStart = import("./boxes").TurnStart;

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const MEMBER = crypto.randomUUID();
const PEOPLE = [OWNER, MEMBER];
const suffix = Date.now();
const COLOR = "#F2B23E";

const callerFor = (userId: string) =>
	createCallerFactory(createTRPCRouter({ chats: chatsRouter }))(
		createTRPCContext({
			session: {
				user: { id: userId, email: `${userId}@example.com` },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
		}),
	);
const owner = callerFor(OWNER);
const member = callerFor(MEMBER);

/** Turns handed to the runner, to be answered by the test. */
const started: TurnStart[] = [];
const cancelled: string[] = [];
let runs: ReturnType<typeof inlineTurnRuns>;
let deps: TurnDeps;

const reply = async (turn: TurnStart, text: string) => {
	await postDevMessage(turn, { text, endsTurn: true });
	await settleTurn(deps, turn, { answer: "" });
};

/** The turn the runner was handed as its `count`th, once it has been. */
async function startedTurn(count: number): Promise<TurnStart> {
	for (let tries = 0; tries < 400 && started.length < count; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	const turn = started[count - 1];
	if (!turn) throw new Error(`turn ${count} never reached the runner`);
	return turn;
}

/** The texts in a group, oldest first, with who wrote each. */
async function thread(groupId: string) {
	const rows = await db
		.select()
		.from(chatsMessages)
		.where(eq(chatsMessages.groupId, groupId))
		.orderBy(asc(chatsMessages.createdAt));
	return rows.map(
		(row) =>
			`${row.authorAgentId ? "dev" : row.authorId ? "person" : "note"}: ${row.text}`,
	);
}

beforeAll(async () => {
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Turns Org", slug: `turns-org-${suffix}` });
	await db.insert(users).values(
		PEOPLE.map((id, index) => ({
			id,
			name: `Person ${index}`,
			email: `turns-${index}-${suffix}@example.com`,
			organizationIds: [ORG],
		})),
	);
	await db.insert(members).values(
		PEOPLE.map((userId) => ({
			id: crypto.randomUUID(),
			organizationId: ORG,
			userId,
			role: "member",
			createdAt: new Date(),
		})),
	);
});

beforeEach(() => {
	started.length = 0;
	cancelled.length = 0;
	published.length = 0;
	runs = inlineTurnRuns(() => deps);
	deps = {
		boxes: memoryBoxes(),
		runner: {
			start: async (_box, turn) => {
				started.push(turn);
			},
			cancel: async (_box, { sessionId }) => {
				cancelled.push(sessionId);
			},
		},
		turnRuns: runs,
		boxKeys: () => keys,
		boxApiUrl: "http://api.test",
		fauxModel: true,
		idleTimeoutMs: 60_000,
	};
	setChatsTurnRuntime(deps);
});

afterAll(async () => {
	setChatsTurnRuntime(null);
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(inArray(users.id, PEOPLE));
	await dbWs.$client.end?.().catch(() => {});
});

test("a 1:1's Dev answers every message, and the chat hears each step", async () => {
	const { group } = await owner.chats.createDev({
		organizationId: ORG,
		name: "Notes",
		color: COLOR,
		description: "Writes notes",
	});
	published.length = 0;
	await owner.chats.sendMessage({ groupId: group.id, text: "hello" });
	const turn = await startedTurn(1);
	expect(turn.text.split("\n").at(-1)).toBe("hello");
	expect(turn.checkReply).toBe(true);
	await reply(turn, "hi there");
	await runs.idle();
	expect(await thread(group.id)).toEqual(["person: hello", "dev: hi there"]);
	expect(published).toEqual([
		{ type: "message.created" },
		{ type: "dev.status", status: "waking" },
		{ type: "dev.status", status: "running" },
		{ type: "turn.started" },
		{ type: "chat.read" },
		{ type: "message.created", endsTurn: true },
		{ type: "dev.status", status: "idle" },
		{ type: "turn.ended" },
	]);
});

test("in a group only a mention of its own Dev, or a follow-up, wakes it", async () => {
	const created = await owner.chats.createGroup({
		organizationId: ORG,
		title: "Launch",
	});
	const groupId = created.group.id;
	await owner.chats.addMember({ groupId, userId: MEMBER });
	const mine = await member.chats.createDev({
		organizationId: ORG,
		name: "Helper",
		color: COLOR,
		description: "Helps",
	});
	await member.chats.addDevToGroup({ groupId, devId: mine.dev.id });

	await owner.chats.sendMessage({ groupId, text: "morning all" });
	await owner.chats.sendMessage({
		groupId,
		text: `${mentionToken({ kind: "dev", id: mine.dev.id })} can you help`,
	});
	await runs.idle();
	expect(started).toEqual([]);

	await owner.chats.sendMessage({
		groupId,
		text: `${mentionToken({ kind: "dev", id: created.dev.id })} what is left`,
	});
	const turn = await startedTurn(1);
	expect(turn.agentId).toBe(created.dev.id);
	await reply(turn, "two things");
	await runs.idle();

	await member.chats.sendMessage({ groupId, text: "which two" });
	const followUp = await startedTurn(2);
	expect(followUp.agentId).toBe(created.dev.id);
	expect(followUp.checkReply).toBe(false);
	await reply(followUp, "these");
	await runs.idle();
});

test("a group's Dev speaks up unasked when the check picks it, once per cooldown", async () => {
	const created = await owner.chats.createGroup({
		organizationId: ORG,
		title: "Support",
	});
	const groupId = created.group.id;
	const asked: string[] = [];
	deps.speakUp = async (input) => {
		asked.push(input.text);
		return created.dev.id;
	};
	await owner.chats.sendMessage({ groupId, text: "how do I reset it" });
	const turn = await startedTurn(1);
	expect(turn.agentId).toBe(created.dev.id);
	expect(turn.text).toContain("picked as the Dev best placed to answer");
	await settleTurn(deps, turn, { answer: "" });
	await runs.idle();

	await owner.chats.sendMessage({ groupId, text: "and after that" });
	await new Promise((resolve) => setTimeout(resolve, 300));
	await runs.idle();
	expect(asked).toEqual(["how do I reset it"]);
	expect(started.length).toBe(1);
});

test("a newer message replaces the turn for the one before it", async () => {
	const { group } = await owner.chats.createDev({
		organizationId: ORG,
		name: "Busy",
		color: COLOR,
		description: "Takes a while",
	});
	await owner.chats.sendMessage({ groupId: group.id, text: "first" });
	const first = await startedTurn(1);
	await owner.chats.sendMessage({ groupId: group.id, text: "second" });
	const second = await startedTurn(2);
	expect(cancelled).toEqual([group.id]);
	expect(await postDevMessage(first, { text: "late", endsTurn: true })).toBe(
		false,
	);
	await reply(second, "answering both");
	await runs.idle();
	expect(await thread(group.id)).toEqual([
		"person: first",
		"person: second",
		"dev: answering both",
	]);
});

test("a turn that fails leaves a note saying why", async () => {
	const { group, dev } = await owner.chats.createDev({
		organizationId: ORG,
		name: "Flaky",
		color: COLOR,
		description: "Breaks",
	});
	await owner.chats.sendMessage({ groupId: group.id, text: "anyone" });
	const turn = await startedTurn(1);
	await settleTurn(deps, turn, { error: "the model refused" });
	await runs.idle();
	expect(await thread(group.id)).toEqual([
		"person: anyone",
		"note: Flaky couldn't reply: the model refused",
	]);
	const after = await owner.chats.bootstrap({ organizationId: ORG });
	expect(after.devs.find((d) => d.id === dev.id)?.status).toBe("idle");
});
