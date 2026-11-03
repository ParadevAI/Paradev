import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const databaseUrl = process.env.AGENT_ACCESS_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("agent access against a migrated PostgreSQL", () => {
	let db: typeof import("@superset/db/client").db;
	let schema: typeof import("@superset/db/schema");
	let createCaller: typeof import("../../root").createCaller;
	let createTRPCContext: typeof import("../../trpc").createTRPCContext;
	let orgId: string;
	const admin = crypto.randomUUID();
	const outsider = crypto.randomUUID();
	let privateChannel: string;
	let otherChannel: string;
	/** Prompts handed to the session workflow; Temporal is not running here. */
	const delivered: { kind: string; sessionId: string; text: string }[] = [];

	const person = (userId: string) =>
		createCaller(
			createTRPCContext({
				session: {
					user: { id: userId, email: `${userId}@agent.test` },
					session: { activeOrganizationId: orgId },
				} as never,
				auth: {} as never,
				headers: new Headers(),
			}),
		);
	const withHeaders = (headers: Record<string, string>) =>
		createCaller(
			createTRPCContext({
				session: null,
				auth: {} as never,
				headers: new Headers(headers),
			}),
		);
	const worker = () =>
		withHeaders({
			"x-agent-worker-secret": process.env.AGENT_WORKER_SECRET ?? "",
		});
	const asAgent = (token: string) =>
		withHeaders({ "x-agent-turn-token": token });

	const sendTo = (userId: string, channelId: string, body: string) =>
		person(userId).channelMessage.send({
			channelId,
			body,
			clientId: crypto.randomUUID(),
		});
	const turnsOf = (agentId: string) =>
		db
			.select()
			.from(schema.agentTurns)
			.where(eq(schema.agentTurns.agentId, agentId));

	/** A Dev in the private channel, working on a DM from `userId`. */
	async function agentWithChannel(userId: string) {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: `Agent ${crypto.randomUUID().slice(0, 6)}`,
		});
		await person(admin).channel.addMembers({
			channelId: privateChannel,
			actorIds: [agent.id],
		});
		const dm = await person(userId).agent.openDirectMessage({
			agentId: agent.id,
		});
		await sendTo(userId, dm.channelId, "kickoff");
		const [turn] = await turnsOf(agent.id);
		if (!turn) throw Error("No turn");
		const { token } = await worker().agentWorker.turnToken({
			turnId: turn.id,
		});
		return { agent, dm, turn, token };
	}

	beforeAll(async () => {
		if (!databaseUrl) throw Error("A migrated test database is required");
		const session = await import("@superset/agent-harness/session");
		mock.module("@superset/agent-harness/session", () => ({
			...session,
			startTurn: async (
				_client: unknown,
				sessionId: string,
				input: { text: string },
			) => {
				delivered.push({ kind: "start", sessionId, text: input.text });
			},
			steerTurn: async (
				_client: unknown,
				sessionId: string,
				input: { text: string },
			) => {
				delivered.push({ kind: "steer", sessionId, text: input.text });
			},
		}));
		mock.module("../../lib/agent-runtime", () => ({
			agentTemporal: async () => ({}),
		}));
		process.env.DATABASE_URL = databaseUrl;
		process.env.DATABASE_URL_UNPOOLED = databaseUrl;
		({ db } = await import("@superset/db/client"));
		schema = await import("@superset/db/schema");
		({ createCaller } = await import("../../root"));
		({ createTRPCContext } = await import("../../trpc"));

		const [org] = await db
			.insert(schema.organizations)
			.values({ name: "Agent access", slug: `agent-${admin}` })
			.returning({ id: schema.organizations.id });
		if (!org) throw Error("No organization");
		orgId = org.id;
		await db.insert(schema.users).values([
			{ id: admin, name: "Admin", email: `${admin}@agent.test` },
			{ id: outsider, name: "Outsider", email: `${outsider}@agent.test` },
		]);
		await db.insert(schema.members).values([
			{ organizationId: orgId, userId: admin, role: "owner" },
			{ organizationId: orgId, userId: outsider, role: "member" },
		]);
		const created = await db
			.insert(schema.channels)
			.values([
				{
					organizationId: orgId,
					name: "secret",
					visibility: "private",
					lastSeq: 1,
				},
				{ organizationId: orgId, name: "other", visibility: "public" },
			])
			.returning({ id: schema.channels.id });
		privateChannel = created[0]?.id ?? "";
		otherChannel = created[1]?.id ?? "";
		await db
			.insert(schema.channelMembers)
			.values({ channelId: privateChannel, actorId: admin, role: "admin" });
		await db.insert(schema.channelMessages).values({
			channelId: privateChannel,
			seq: 1,
			authorUserId: admin,
			body: "only for members",
		});
	}, 30000);

	afterAll(async () => {
		const { inArray } = await import("drizzle-orm");
		if (orgId) {
			await db
				.delete(schema.organizations)
				.where(eq(schema.organizations.id, orgId));
		}
		await db
			.delete(schema.users)
			.where(inArray(schema.users.id, [admin, outsider]));
	}, 30000);

	test("a granted agent reads the channel for a person who can", async () => {
		const { token } = await agentWithChannel(admin);
		const channels = await asAgent(token).agentApi.channels();
		expect(channels.map((channel) => channel.id)).toEqual([privateChannel]);
		const page = await asAgent(token).agentApi.channelMessages({
			channelId: privateChannel,
		});
		expect(page.messages.map((message) => message.body)).toEqual([
			"only for members",
			"has joined the channel",
		]);
	});

	test("an agent can't read what the person who started the turn can't", async () => {
		const { token } = await agentWithChannel(outsider);
		expect(await asAgent(token).agentApi.channels()).toEqual([]);
		await expect(
			asAgent(token).agentApi.channelMessages({ channelId: privateChannel }),
		).rejects.toThrow("Channel not found");
	});

	test("an agent can't read a channel it wasn't granted", async () => {
		const { token } = await agentWithChannel(admin);
		await expect(
			asAgent(token).agentApi.channelMessages({ channelId: otherChannel }),
		).rejects.toThrow("Channel not found");
	});

	test("a message mid-turn joins it, and the turn settles only after the worker read it", async () => {
		const { agent, dm, turn, token } = await agentWithChannel(admin);
		const steer = await sendTo(admin, dm.channelId, "also this");
		expect(await turnsOf(agent.id)).toMatchObject([
			{ id: turn.id, steerPromptIds: [steer.id] },
		]);
		await expect(
			worker().agentWorker.settleTurn({
				turnId: turn.id,
				status: "completed",
				steersConsumed: 0,
			}),
		).rejects.toThrow("STEER_PENDING");
		await worker().agentWorker.settleTurn({
			turnId: turn.id,
			status: "completed",
			steersConsumed: 1,
		});
		await expect(asAgent(token).agentApi.me()).rejects.toThrow(
			"Turn is not running.",
		);
	});

	test("a resent message runs once; the next one starts a new turn", async () => {
		const { agent, dm, turn } = await agentWithChannel(admin);
		await worker().agentWorker.settleTurn({
			turnId: turn.id,
			status: "completed",
			steersConsumed: 0,
			reply: "done",
			inputTokens: 10,
		});
		const message = {
			channelId: dm.channelId,
			body: "again",
			clientId: crypto.randomUUID(),
		};
		await person(admin).channelMessage.send(message);
		await person(admin).channelMessage.send(message);
		const turns = await turnsOf(agent.id);
		expect(turns).toHaveLength(2);
		expect(turns.find((row) => row.id === turn.id)).toMatchObject({
			reply: "done",
			inputTokens: 10,
		});
	});

	test("a DM is a private room: a person's message starts a turn and the Dev's reply lands in it", async () => {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: "Chatty",
		});
		const { channelId } = await person(admin).agent.openDirectMessage({
			agentId: agent.id,
		});
		expect(
			(await person(admin).agent.openDirectMessage({ agentId: agent.id }))
				.channelId,
		).toBe(channelId);
		const listed = await person(admin).channel.list({ organizationId: orgId });
		expect(listed.map((c) => c.id)).not.toContain(channelId);
		const sent = await person(admin).channelMessage.send({
			channelId,
			body: "hello",
			clientId: crypto.randomUUID(),
		});
		const [dev] = await db
			.select({ mainSessionId: schema.agents.mainSessionId })
			.from(schema.agents)
			.where(eq(schema.agents.id, agent.id));
		const sessionId = dev?.mainSessionId ?? "";
		const [turn] = await db
			.select()
			.from(schema.agentTurns)
			.where(eq(schema.agentTurns.sessionId, sessionId));
		expect(turn).toMatchObject({
			status: "running",
			promptId: sent.id,
			triggerMessageId: sent.id,
		});
		const start = delivered.find((prompt) => prompt.sessionId === sessionId);
		expect(start?.kind).toBe("start");
		expect(start?.text).toContain(`reply_to="channel:${channelId}"`);
		expect(start?.text).toContain("hello");
		const credentials = await worker().agentWorker.turnCredentials({
			turnId: turn?.id ?? "",
		});
		expect(credentials.room).toEqual({ channelId, threadRootId: null });
		const token = credentials.agentToken;
		const post = { channelId, body: "hi there", idempotencyKey: "call-1" };
		const reply = await asAgent(token).agentApi.postMessage(post);
		expect(reply.authorId).toBe(agent.id);
		expect((await asAgent(token).agentApi.postMessage(post)).id).toBe(reply.id);
		const page = await person(admin).channelMessage.list({
			channelId,
			limit: 20,
		});
		expect(page.messages.map((m) => [m.body, m.authorId])).toEqual([
			["hello", admin],
			["hi there", agent.id],
		]);
		await expect(
			person(outsider).channelMessage.list({ channelId, limit: 20 }),
		).rejects.toThrow("Channel not found");
	});

	test("a Dev added to a channel is a member until it is removed", async () => {
		const { agent, token } = await agentWithChannel(admin);
		const members = await person(admin).channel.members({
			channelId: privateChannel,
		});
		expect(
			members.map((member) => [member.actorId, member.kind]),
		).toContainEqual([agent.id, "dev"]);
		expect(members.find((member) => member.actorId === admin)?.kind).toBe(
			"person",
		);
		await expect(
			person(admin).channel.setRole({
				channelId: privateChannel,
				actorId: agent.id,
				role: "admin",
			}),
		).rejects.toThrow("Only people can manage a channel");
		await person(admin).channel.removeMember({
			channelId: privateChannel,
			actorId: agent.id,
		});
		expect(await asAgent(token).agentApi.channels()).toEqual([]);
	});

	test("a private channel left with only a Dev is archived", async () => {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: "Lonely",
		});
		const { id } = await person(admin).channel.create({
			organizationId: orgId,
			name: `lonely-${crypto.randomUUID().slice(0, 6)}`,
			visibility: "private",
			memberIds: [],
		});
		await person(admin).channel.addMembers({
			channelId: id,
			actorIds: [agent.id],
		});
		await person(admin).channel.leave({ channelId: id });
		const [row] = await db
			.select({ archivedAt: schema.channels.archivedAt })
			.from(schema.channels)
			.where(eq(schema.channels.id, id));
		expect(row?.archivedAt).not.toBeNull();
	});

	test("mentioning a Dev starts its work in the message's thread; replies there continue it", async () => {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: "Mentioned",
		});
		const outside = await person(admin).agent.create({
			organizationId: orgId,
			name: "Outside",
		});
		const { id: channelId } = await person(admin).channel.create({
			organizationId: orgId,
			name: `mentions-${crypto.randomUUID().slice(0, 6)}`,
			visibility: "private",
			memberIds: [],
		});
		await person(admin).channel.addMembers({
			channelId,
			actorIds: [agent.id],
		});
		const root = await person(admin).channelMessage.send({
			channelId,
			body: "@Mentioned @Outside look at this",
			clientId: crypto.randomUUID(),
			mentionedIds: [agent.id, outside.id, admin],
		});
		expect(root.mentionedIds).toEqual([agent.id]);
		const turns = () =>
			db
				.select({
					reason: schema.agentTurns.reason,
					steers: schema.agentTurns.steerPromptIds,
					kind: schema.agentSessions.kind,
				})
				.from(schema.agentTurns)
				.innerJoin(
					schema.agentSessions,
					eq(schema.agentSessions.id, schema.agentTurns.sessionId),
				)
				.where(eq(schema.agentTurns.agentId, agent.id));
		expect(await turns()).toEqual([
			{ reason: "mention", steers: [], kind: "main" },
		]);
		const reply = await person(admin).channelMessage.send({
			channelId,
			body: "and this",
			threadRootId: root.id,
			clientId: crypto.randomUUID(),
		});
		expect(await turns()).toEqual([
			{ reason: "mention", steers: [reply.id], kind: "main" },
		]);
		const toAgent = delivered.filter(
			(prompt) =>
				prompt.text.includes("look at this") ||
				prompt.text.includes("and this"),
		);
		expect(toAgent.map((prompt) => prompt.kind)).toEqual(["start", "steer"]);
		expect(toAgent[1]?.text).toContain(
			`reply_to="channel:${channelId}/thread:${root.id}"`,
		);
	});

	test("the main session replies where a message came from, and remembers", async () => {
		const { agent, dm, token } = await agentWithChannel(admin);
		const tools = asAgent(token).devTools;
		const posted = await tools.reply({
			target: `channel:${dm.channelId}`,
			body: "on it",
		});
		const page = await person(admin).channelMessage.list({
			channelId: dm.channelId,
			limit: 50,
		});
		expect(
			page.messages.find((message) => message.id === posted.messageId)
				?.authorId,
		).toBe(agent.id);
		await expect(
			tools.reply({ target: `channel:${otherChannel}`, body: "hi" }),
		).rejects.toThrow("Channel not found");
		await tools.remember({ content: "Satya prefers short replies" });
		expect(
			(await tools.recall({ query: "short" })).map((note) => note.content),
		).toEqual(["Satya prefers short replies"]);
		expect(await tools.listWork()).toEqual([]);
	});

	test("a task session's finished turn records the task's pull request and tells its main session once", async () => {
		const { agent, turn: mainTurn } = await agentWithChannel(admin);
		const { task: work } = await person(admin).task.create({
			title: "Fix the login 500",
		});
		if (!work) throw Error("No Paradev task");
		const [task] = await db
			.insert(schema.agentSessions)
			.values({
				organizationId: orgId,
				agentId: agent.id,
				kind: "task",
				parentSessionId: mainTurn.sessionId,
				taskId: work.id,
				role: "writer",
				taskStatus: "running",
				requestedByUserId: admin,
			})
			.returning();
		if (!task) throw Error("No task");
		const [taskTurn] = await db
			.insert(schema.agentTurns)
			.values({
				organizationId: orgId,
				agentId: agent.id,
				sessionId: task.id,
				reason: "task_start",
				actingUserId: admin,
				promptId: `task-start:${task.id}`,
			})
			.returning();
		if (!taskTurn) throw Error("No task turn");
		const { token } = await worker().agentWorker.turnToken({
			turnId: taskTurn.id,
		});
		await expect(asAgent(token).devTools.listWork()).rejects.toThrow(
			"Only a Dev's main session",
		);
		const settle = () =>
			worker().agentWorker.settleTurn({
				turnId: taskTurn.id,
				status: "completed",
				steersConsumed: 0,
				reply: "Fixed. https://github.com/acme/app/pull/7",
			});
		await settle();
		await settle();
		const [after] = await db
			.select()
			.from(schema.agentSessions)
			.where(eq(schema.agentSessions.id, task.id));
		expect(after?.taskStatus).toBe("done");
		const [recorded] = await db
			.select({ prUrl: schema.tasks.prUrl })
			.from(schema.tasks)
			.where(eq(schema.tasks.id, work.id));
		expect(recorded?.prUrl).toBe("https://github.com/acme/app/pull/7");
		const mainToken = (
			await worker().agentWorker.turnToken({ turnId: mainTurn.id })
		).token;
		expect(await asAgent(mainToken).devTools.listWork()).toMatchObject([
			{
				taskId: work.id,
				title: "Fix the login 500",
				pullRequestUrl: "https://github.com/acme/app/pull/7",
				sessions: [{ sessionId: task.id, role: "writer", status: "done" }],
			},
		]);
		const [main] = await db
			.select({ steers: schema.agentTurns.steerPromptIds })
			.from(schema.agentTurns)
			.where(eq(schema.agentTurns.id, mainTurn.id));
		expect(
			main?.steers.filter((id) => id === `task-update:${taskTurn.id}`),
		).toHaveLength(1);
		expect(
			delivered.some(
				(prompt) =>
					prompt.sessionId === mainTurn.sessionId &&
					prompt.text.includes("Fix the login 500") &&
					prompt.text.includes("pull/7"),
			),
		).toBe(true);
	});

	test("archiving an agent revokes it at once", async () => {
		const { agent, token } = await agentWithChannel(admin);
		await person(admin).agent.archive({ agentId: agent.id });
		await expect(asAgent(token).agentApi.me()).rejects.toThrow(
			"Turn is not running.",
		);
	});

	test("any member creates an agent; only its creator or an admin changes it", async () => {
		const mine = await person(outsider).agent.create({
			organizationId: orgId,
			name: "Mine",
		});
		expect(mine.avatar.shape).toBeTruthy();
		const theirs = await person(admin).agent.create({
			organizationId: orgId,
			name: "Theirs",
		});
		await expect(
			person(outsider).agent.update({ agentId: theirs.id, name: "Hijacked" }),
		).rejects.toThrow("Only its creator or an organization admin");
		await person(admin).agent.update({ agentId: mine.id, name: "Renamed" });
		expect((await person(outsider).agent.get({ agentId: mine.id })).name).toBe(
			"Renamed",
		);
		await expect(
			withHeaders({ "x-agent-worker-secret": "wrong" }).agentWorker.turnToken({
				turnId: crypto.randomUUID(),
			}),
		).rejects.toThrow("Unknown worker.");
	});

	test("activity shows each person only their own DM and channels they can read", async () => {
		const { agent, dm } = await agentWithChannel(admin);
		const mine = await person(admin).agent.activity({ agentId: agent.id });
		expect(mine.turns.map((turn) => turn.channelId)).toEqual([dm.channelId]);
		const theirs = await person(outsider).agent.activity({ agentId: agent.id });
		expect(theirs.turns).toEqual([]);
	});

	test("activity pages through turns that started at the same moment", async () => {
		const { agent, dm, turn } = await agentWithChannel(admin);
		const startedAt = new Date();
		await db.insert(schema.agentTurns).values(
			Array.from({ length: 51 }, () => ({
				organizationId: orgId,
				agentId: agent.id,
				sessionId: dm.sessionId,
				status: "completed" as const,
				reason: "direct_message" as const,
				actingUserId: admin,
				triggerMessageId: turn.triggerMessageId,
				startedAt,
			})),
		);
		const first = await person(admin).agent.activity({ agentId: agent.id });
		const second = await person(admin).agent.activity({
			agentId: agent.id,
			cursor: first.nextCursor,
		});
		const ids = [...first.turns, ...second.turns].map((turn) => turn.id);
		expect(ids).toHaveLength(52);
		expect(new Set(ids).size).toBe(52);
	});

	test("a paused agent starts no turns", async () => {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: "Private",
		});
		await person(admin).agent.pause({ agentId: agent.id });
		const dm = await person(admin).agent.openDirectMessage({
			agentId: agent.id,
		});
		await sendTo(admin, dm.channelId, "anyone there?");
		expect(await turnsOf(agent.id)).toEqual([]);
	});
	/** A Temporal client whose session workflows all look like `description`. */
	function fakeTemporal(description: { status: string; failedTasks?: number }) {
		const terminated: string[] = [];
		const client = {
			workflow: {
				getHandle: (workflowId: string) => ({
					describe: async () => ({
						status: { name: description.status },
						raw: {
							pendingWorkflowTask: description.failedTasks
								? { attempt: description.failedTasks }
								: null,
						},
					}),
					query: async () => ({ turnId: null, pendingTurns: 0 }),
					terminate: async () => {
						terminated.push(workflowId);
					},
				}),
			},
		};
		return { terminated, client: client as never };
	}

	const minutesAgo = (minutes: number) =>
		new Date(Date.now() - minutes * 60_000);

	test("the reconciler delivers a DM that never became a turn, once", async () => {
		const { agent, dm } = await agentWithChannel(admin);
		const [room] = await db
			.update(schema.channels)
			.set({ lastSeq: sql`${schema.channels.lastSeq} + 1` })
			.where(eq(schema.channels.id, dm.channelId))
			.returning({ seq: schema.channels.lastSeq });
		const [dropped] = await db
			.insert(schema.channelMessages)
			.values({
				channelId: dm.channelId,
				seq: room?.seq ?? 0,
				authorId: admin,
				body: "did you get this?",
				createdAt: minutesAgo(5),
			})
			.returning({ id: schema.channelMessages.id });
		const { reconcileDevs } = await import("./reconcile");
		const reached = async () =>
			(await turnsOf(agent.id)).filter(
				(turn) =>
					turn.promptId === dropped?.id ||
					turn.steerPromptIds.includes(dropped?.id ?? ""),
			).length;
		await reconcileDevs(fakeTemporal({ status: "RUNNING" }).client, {
			organizationId: orgId,
		});
		expect(await reached()).toBe(1);
		await reconcileDevs(fakeTemporal({ status: "RUNNING" }).client, {
			organizationId: orgId,
		});
		expect(await reached()).toBe(1);
	});

	test("the reconciler settles a turn its workflow lost and sends its message again", async () => {
		const { agent, turn } = await agentWithChannel(admin);
		await db
			.update(schema.agentTurns)
			.set({ startedAt: minutesAgo(10) })
			.where(eq(schema.agentTurns.id, turn.id));
		const { reconcileDevs } = await import("./reconcile");
		await reconcileDevs(fakeTemporal({ status: "COMPLETED" }).client, {
			organizationId: orgId,
		});
		const turns = await turnsOf(agent.id);
		expect(turns.find((row) => row.id === turn.id)).toMatchObject({
			status: "failed",
			errorCode: "lost",
		});
		expect(
			turns.some((row) => row.promptId === `again:${turn.triggerMessageId}`),
		).toBe(true);
	});

	test("the reconciler settles a lost turn older than an hour without sending it again", async () => {
		const { agent, turn } = await agentWithChannel(admin);
		await db
			.update(schema.agentTurns)
			.set({ startedAt: minutesAgo(120) })
			.where(eq(schema.agentTurns.id, turn.id));
		const { reconcileDevs } = await import("./reconcile");
		await reconcileDevs(fakeTemporal({ status: "COMPLETED" }).client, {
			organizationId: orgId,
		});
		const turns = await turnsOf(agent.id);
		expect(turns).toHaveLength(1);
		expect(turns[0]).toMatchObject({ status: "failed", errorCode: "lost" });
	});

	test("the reconciler terminates a session workflow whose workflow task keeps failing", async () => {
		const { turn } = await agentWithChannel(admin);
		await db
			.update(schema.agentTurns)
			.set({ startedAt: minutesAgo(10) })
			.where(eq(schema.agentTurns.id, turn.id));
		const { reconcileDevs } = await import("./reconcile");
		const temporal = fakeTemporal({ status: "RUNNING", failedTasks: 5 });
		await reconcileDevs(temporal.client, { organizationId: orgId });
		expect(temporal.terminated).toContain(`session/${turn.sessionId}`);
		const row = (await turnsOf(turn.agentId)).find(({ id }) => id === turn.id);
		expect(row).toMatchObject({ status: "failed", errorCode: "lost" });
	});

	const settle = (turnId: string) =>
		worker().agentWorker.settleTurn({
			turnId,
			status: "completed",
			steersConsumed: 0,
		});
	const inHours = (hours: number) =>
		new Date(Date.now() + hours * 3600_000).toISOString();
	const routineTurnsOf = async (agentId: string) =>
		(await turnsOf(agentId)).filter((turn) => turn.reason === "routine");
	const makeDue = (routineId: string) =>
		db
			.update(schema.agentRoutines)
			.set({ nextRunAt: minutesAgo(1) })
			.where(eq(schema.agentRoutines.id, routineId));
	const runDue = async () => {
		const { fireDueRoutines } = await import("./routines");
		return fireDueRoutines({ organizationId: orgId });
	};

	test("a routine runs in the Dev's main session, for the person who asked, answering where it was made", async () => {
		const { agent, dm, turn, token } = await agentWithChannel(admin);
		const routine = await asAgent(token).devTools.createRoutine({
			title: "Digest",
			prompt: "Tell me what merged.",
			schedule: { start: inHours(2), repeat: "FREQ=DAILY", timezone: "UTC" },
			replyTo: `channel:${dm.channelId}`,
		});
		expect(routine.nextRunAt).not.toBeNull();
		await settle(turn.id);
		await makeDue(routine.id);
		expect(await runDue()).toBe(1);
		expect(await runDue()).toBe(0);
		expect(await routineTurnsOf(agent.id)).toMatchObject([
			{ routineId: routine.id, actingUserId: admin, sessionId: turn.sessionId },
		]);
		const text = delivered.at(-1)?.text ?? "";
		expect(text).toContain("Tell me what merged.");
		expect(text).toContain(`reply_to="channel:${dm.channelId}"`);
		const [row] = await db
			.select()
			.from(schema.agentRoutines)
			.where(eq(schema.agentRoutines.id, routine.id));
		expect(row?.nextRunAt?.getTime()).toBeGreaterThan(Date.now());
	});

	test("a one-off routine switches itself off after it runs", async () => {
		const { dm, turn, token } = await agentWithChannel(admin);
		const routine = await asAgent(token).devTools.createRoutine({
			title: "Reminder",
			prompt: "Remind me to stretch.",
			schedule: { start: inHours(1), repeat: null, timezone: "UTC" },
			replyTo: `channel:${dm.channelId}`,
		});
		await settle(turn.id);
		await makeDue(routine.id);
		await runDue();
		const [row] = await db
			.select()
			.from(schema.agentRoutines)
			.where(eq(schema.agentRoutines.id, routine.id));
		expect(row).toMatchObject({ enabled: false, nextRunAt: null });
	});

	test("a routine runs at most once an hour", async () => {
		const { dm, token } = await agentWithChannel(admin);
		await expect(
			asAgent(token).devTools.createRoutine({
				title: "Spam",
				prompt: "Ping.",
				schedule: {
					start: inHours(1),
					repeat: "FREQ=MINUTELY;INTERVAL=10",
					timezone: "UTC",
				},
				replyTo: `channel:${dm.channelId}`,
			}),
		).rejects.toThrow("at most once an hour");
	});

	test("a Dev watching a channel gets each new message with its routine, once", async () => {
		const { agent, dm, turn, token } = await agentWithChannel(admin);
		await asAgent(token).devTools.createRoutine({
			title: "Questions in #secret",
			prompt: "Answer questions about who owns what.",
			watchChannels: ["secret"],
			replyTo: `channel:${dm.channelId}`,
		});
		await settle(turn.id);
		const question = await sendTo(admin, privateChannel, "who owns billing?");
		const routineTurns = await routineTurnsOf(agent.id);
		expect(routineTurns).toMatchObject([
			{ promptId: question.id, triggerMessageId: question.id },
		]);
		const text = delivered.at(-1)?.text ?? "";
		expect(text).toContain("who owns billing?");
		expect(text).toContain("Answer questions about who owns what.");
		expect(text).toContain(
			`reply_to="channel:${privateChannel}/thread:${question.id}"`,
		);
		const [watched] = await db
			.select()
			.from(schema.agentRoutines)
			.where(eq(schema.agentRoutines.agentId, agent.id));
		expect(watched?.lastRunAt).not.toBeNull();
	});

	test("a Dev can't watch a channel the person it works for can't read", async () => {
		const { dm, token } = await agentWithChannel(outsider);
		await expect(
			asAgent(token).devTools.createRoutine({
				title: "Snoop",
				prompt: "Watch.",
				watchChannels: ["secret"],
				replyTo: `channel:${dm.channelId}`,
			}),
		).rejects.toThrow("can't read it");
	});

	test("a matching provider event wakes the routines watching it", async () => {
		const { agent, dm, turn, token } = await agentWithChannel(admin);
		await asAgent(token).devTools.createRoutine({
			title: "New PRs",
			prompt: "Tell me about new PRs.",
			watchEvents: [
				{
					kind: "github",
					event: "pull_request.opened",
					repositories: { mode: "list", ids: ["4242"] },
				},
			],
			replyTo: `channel:${dm.channelId}`,
		});
		await settle(turn.id);
		const { notifyRoutinesOfEvent } = await import("./routines");
		const event = (repositoryId: string) => ({
			provider: "github" as const,
			eventType: "pull_request.opened",
			actorId: "1",
			actorLogin: "octocat",
			body: null,
			repositoryId,
			ref: "main",
			actorIsExternal: false,
			labels: [],
			isFork: false,
			subjectAuthorId: null,
			subjectAuthorLogin: null,
			assigneeId: null,
			assigneeLogin: null,
			names: ["pull_request.opened" as const],
		});
		for (const repositoryId of ["9999", "4242"]) {
			await notifyRoutinesOfEvent({
				eventId: crypto.randomUUID(),
				event: {
					organizationId: orgId,
					eventType: "pull_request.opened",
					title: `PR in ${repositoryId}`,
					url: null,
				},
				dispatch: { event: event(repositoryId) },
			});
		}
		expect(await routineTurnsOf(agent.id)).toHaveLength(1);
		expect(delivered.at(-1)?.text).toContain("PR in 4242");
	});

	test("people see their own routines; only their creator or a manager changes them", async () => {
		const { agent, dm, turn, token } = await agentWithChannel(admin);
		const routine = await asAgent(token).devTools.createRoutine({
			title: "Mine",
			prompt: "Do it.",
			schedule: { start: inHours(3), repeat: "FREQ=DAILY", timezone: "UTC" },
			replyTo: `channel:${dm.channelId}`,
		});
		await settle(turn.id);
		const listed = await person(admin).agentRoutine.list({ agentId: agent.id });
		expect(listed.map((r) => r.id)).toEqual([routine.id]);
		expect(
			await person(outsider).agentRoutine.list({ agentId: agent.id }),
		).toEqual([]);
		await expect(
			person(outsider).agentRoutine.update({
				routineId: routine.id,
				enabled: false,
			}),
		).rejects.toThrow("Routine not found");
		await person(admin).agentRoutine.update({
			routineId: routine.id,
			enabled: false,
		});
		const [paused] = await db
			.select()
			.from(schema.agentRoutines)
			.where(eq(schema.agentRoutines.id, routine.id));
		expect(paused).toMatchObject({ enabled: false, nextRunAt: null });
		await person(admin).agentRoutine.delete({ routineId: routine.id });
		expect(
			await person(admin).agentRoutine.list({ agentId: agent.id }),
		).toEqual([]);
	});

	test("people move a routine to a channel the Dev posts in, or back to the DM", async () => {
		const { agent, dm, turn, token } = await agentWithChannel(admin);
		const routine = await asAgent(token).devTools.createRoutine({
			title: "Movable",
			prompt: "Do it.",
			schedule: { start: inHours(3), repeat: "FREQ=DAILY", timezone: "UTC" },
			replyTo: `channel:${dm.channelId}`,
		});
		await settle(turn.id);
		const roomOf = async () =>
			(
				await db
					.select({ channelId: schema.agentRoutines.channelId })
					.from(schema.agentRoutines)
					.where(eq(schema.agentRoutines.id, routine.id))
			)[0]?.channelId;
		await person(admin).agentRoutine.update({
			routineId: routine.id,
			room: { kind: "channel", channelId: privateChannel },
		});
		expect(await roomOf()).toBe(privateChannel);
		await expect(
			person(admin).agentRoutine.update({
				routineId: routine.id,
				room: { kind: "channel", channelId: otherChannel },
			}),
		).rejects.toThrow("can't post there");
		await person(admin).agentRoutine.update({
			routineId: routine.id,
			room: { kind: "dm" },
		});
		expect(await roomOf()).toBe(dm.channelId);
		expect(
			(await person(admin).agentRoutine.list({ agentId: agent.id }))[0]?.room,
		).toMatchObject({ kind: "dm", channelId: dm.channelId });
	});
});
