import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";

const published: string[] = [];
mock.module("../publish", () => ({
	publishChats: (_channel: string, data: { type: string }) => {
		published.push(data.type);
	},
}));

const { db, dbWs } = await import("@superset/db/client");
const { chatsMessages, members, organizations, users } = await import(
	"@superset/db/schema"
);
const { asc, eq, inArray } = await import("drizzle-orm");
const { chatsRouter } = await import("../chats");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../../trpc");
const { postDevMessage, settleTurn } = await import("../turns/engine");
const { inlineTurnRuns } = await import("../turns/inline-runs");
const { setChatsTurnRuntime } = await import("../turns/runtime");
const { memoryBoxes } = await import("../turns/scripted");
const { generateBoxKeys } = await import("../turns/box-tokens");
const { fireTask } = await import("./chat-tasks");
const keys = generateBoxKeys();

type TurnDeps = import("../turns/engine").TurnDeps;
type TurnStart = import("../turns/boxes").TurnStart;

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const suffix = Date.now();

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
let runs: ReturnType<typeof inlineTurnRuns>;
let deps: TurnDeps;

async function startedTurn(count: number): Promise<TurnStart> {
	for (let tries = 0; tries < 400 && started.length < count; tries++) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	const turn = started[count - 1];
	if (!turn) throw new Error(`turn ${count} never reached the runner`);
	return turn;
}

async function thread(groupId: string) {
	const rows = await db
		.select()
		.from(chatsMessages)
		.where(eq(chatsMessages.groupId, groupId))
		.orderBy(asc(chatsMessages.createdAt));
	return rows.map(
		(row) =>
			`${row.authorAgentId ? "dev" : row.authorId ? "person" : "note"}${row.taskId ? " (card)" : ""}: ${row.text}`,
	);
}

beforeAll(async () => {
	await db
		.insert(organizations)
		.values({ id: ORG, name: "Tasks Org", slug: `chat-tasks-org-${suffix}` });
	await db.insert(users).values({
		id: OWNER,
		name: "Ada",
		email: `chat-tasks-${suffix}@example.com`,
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
	started.length = 0;
	published.length = 0;
	runs = inlineTurnRuns(() => deps);
	deps = {
		boxes: memoryBoxes(),
		runner: {
			start: async (_box, turn) => {
				started.push(turn);
			},
			cancel: async () => {},
			busy: async () => false,
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
	await db.delete(users).where(inArray(users.id, [OWNER]));
	await dbWs.$client.end?.().catch(() => {});
});

test("a task in a 1:1 is its Dev's: it runs as a turn, its last words are the task's note, and it ends done", async () => {
	const { group, dev } = await owner.chats.createDev({
		organizationId: ORG,
		name: "Notes",
		color: "#F2B23E",
		description: "Writes notes",
	});
	const sent = await owner.chats.sendMessage({
		groupId: group.id,
		text: "/task summarise the launch notes",
		task: { title: "summarise the launch notes" },
	});
	expect(sent.task).toMatchObject({
		title: "summarise the launch notes",
		status: "todo",
		assigneeDevId: dev.id,
		assigneeId: null,
	});
	const taskId = sent.task?.id ?? "";

	const turn = await startedTurn(1);
	expect(turn.text.split("\n")[0]).toBe("## Task");
	expect(turn.text).toContain(`Task: ${taskId} "summarise the launch notes"`);
	expect(turn.checkReply).toBe(false);
	expect(await postDevMessage(turn, { text: "done", endsTurn: true })).toBe(
		"task",
	);
	await postDevMessage(turn, { text: "Summary is ready.", endsTurn: false });
	await settleTurn(deps, turn, { answer: "Three themes, in the summary." });
	await runs.idle();

	expect(await thread(group.id)).toEqual([
		"person (card): /task summarise the launch notes",
		"dev: Summary is ready.",
	]);
	const { activity } = await owner.chats.taskActivity({ taskId });
	expect(activity.map((entry) => entry.kind)).toEqual([
		"created",
		"assigned",
		"started",
		"progress",
		"done",
	]);
	expect(activity[3]?.text).toBe("Three themes, in the summary.");
	const after = await owner.chats.bootstrap({ organizationId: ORG });
	expect(after.tasks.find((task) => task.id === taskId)?.status).toBe("done");
	expect(published).toContain("task.updated");
});

test("a person's task with a time posts a reminder card when the time comes, once", async () => {
	const { group } = await owner.chats.createDev({
		organizationId: ORG,
		name: "Clock",
		color: "#F2B23E",
		description: "Keeps time",
	});
	const at = new Date(Date.now() + 60 * 60_000);
	const { task } = await owner.chats.createTask({
		groupId: group.id,
		task: {
			title: "call the venue",
			assignee: "me",
			scheduledAt: at.toISOString(),
			remind: true,
		},
	});
	expect(task).toMatchObject({ assigneeId: OWNER, assigneeDevId: null });
	const taskId = task?.id ?? "";
	const later = new Date(at.getTime() + 1_000);
	await fireTask(deps, taskId, 0, later);
	await fireTask(deps, taskId, 0, later);
	await runs.idle();
	expect(started).toEqual([]);
	expect(await thread(group.id)).toEqual([
		"person (card): Added a task: call the venue",
		`note (card): Reminder: call the venue <@user:${OWNER}>`,
	]);
	await owner.chats.deleteTask({ taskId });
	expect(await thread(group.id)).toEqual([]);
});
