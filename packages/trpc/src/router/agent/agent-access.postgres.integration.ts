import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

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

	async function agentWithChannel(userId: string) {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: `Agent ${crypto.randomUUID().slice(0, 6)}`,
		});
		await person(admin).agent.grantChannel({
			agentId: agent.id,
			channelId: privateChannel,
		});
		const turn = await person(userId).agent.startDirectTurn({
			agentId: agent.id,
			promptId: "kickoff",
		});
		const { token } = await worker().agentWorker.turnToken({
			turnId: turn.turnId,
		});
		return { agent, turn, token };
	}

	beforeAll(async () => {
		if (!databaseUrl) throw Error("A migrated test database is required");
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
				{ organizationId: orgId, name: "secret", visibility: "private" },
				{ organizationId: orgId, name: "other", visibility: "public" },
			])
			.returning({ id: schema.channels.id });
		privateChannel = created[0]?.id ?? "";
		otherChannel = created[1]?.id ?? "";
		await db
			.insert(schema.channelMembers)
			.values({ channelId: privateChannel, userId: admin, role: "admin" });
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
		const { agent, turn, token } = await agentWithChannel(admin);
		const steer = { agentId: agent.id, promptId: "steer-1" };
		const joined = await person(admin).agent.startDirectTurn(steer);
		expect(joined).toEqual({
			sessionId: turn.sessionId,
			turnId: turn.turnId,
			outcome: "joined",
			steerSeq: 1,
		});
		expect((await person(admin).agent.startDirectTurn(steer)).outcome).toBe(
			"duplicate",
		);
		await expect(
			worker().agentWorker.settleTurn({
				turnId: turn.turnId,
				status: "completed",
				steersConsumed: 0,
			}),
		).rejects.toThrow("STEER_PENDING");
		await worker().agentWorker.settleTurn({
			turnId: turn.turnId,
			status: "completed",
			steersConsumed: 1,
		});
		await expect(asAgent(token).agentApi.me()).rejects.toThrow(
			"Turn is not running.",
		);
	});

	test("a resent prompt runs once, even after its turn settled", async () => {
		const { agent, turn } = await agentWithChannel(admin);
		await worker().agentWorker.settleTurn({
			turnId: turn.turnId,
			status: "completed",
			steersConsumed: 0,
			reply: "done",
			inputTokens: 10,
		});
		const resent = await person(admin).agent.startDirectTurn({
			agentId: agent.id,
			promptId: "kickoff",
		});
		expect(resent).toEqual({ ...turn, outcome: "duplicate" });
		const [row] = await db
			.select()
			.from(schema.agentTurns)
			.where(eq(schema.agentTurns.id, turn.turnId));
		expect(row).toMatchObject({ reply: "done", inputTokens: 10 });
		const next = await person(admin).agent.startDirectTurn({
			agentId: agent.id,
			promptId: "prompt-2",
		});
		expect(next.outcome).toBe("started");
	});

	test("a DM is a private room: a person's message starts a turn and the Dev's reply lands in it", async () => {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: "Chatty",
		});
		const { channelId, sessionId } = await person(
			admin,
		).agent.openDirectMessage({ agentId: agent.id });
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
			fileIds: [],
			mentionedUserIds: [],
		});
		const [turn] = await db
			.select()
			.from(schema.agentTurns)
			.where(eq(schema.agentTurns.sessionId, sessionId));
		expect(turn).toMatchObject({
			status: "running",
			promptId: sent.id,
			triggerMessageId: sent.id,
		});
		const { token } = await worker().agentWorker.turnToken({
			turnId: turn?.id ?? "",
		});
		const post = { channelId, body: "hi there", idempotencyKey: "call-1" };
		const reply = await asAgent(token).agentApi.postMessage(post);
		expect(reply.authorAgentId).toBe(agent.id);
		expect((await asAgent(token).agentApi.postMessage(post)).id).toBe(reply.id);
		const page = await person(admin).channelMessage.list({
			channelId,
			limit: 20,
		});
		expect(page.messages.map((m) => [m.body, m.authorAgentId])).toEqual([
			["hello", null],
			["hi there", agent.id],
		]);
		await expect(
			person(outsider).channelMessage.list({ channelId, limit: 20 }),
		).rejects.toThrow("Channel not found");
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

	test("a paused agent starts no turns, and a creator-only agent is hidden from others", async () => {
		const agent = await person(admin).agent.create({
			organizationId: orgId,
			name: "Private",
		});
		await person(admin).agent.pause({ agentId: agent.id });
		await expect(
			person(admin).agent.startDirectTurn({ agentId: agent.id, promptId: "p" }),
		).rejects.toThrow("This agent is paused");
		await person(admin).agent.update({
			agentId: agent.id,
			messageAccess: "creator",
		});
		const visible = await person(outsider).agent.list({
			organizationId: orgId,
		});
		expect(visible.map((a) => a.id)).not.toContain(agent.id);
		await expect(
			person(outsider).agent.get({ agentId: agent.id }),
		).rejects.toThrow("Agent not found");
	});
});
