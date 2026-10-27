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
	});

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

	test("a session runs one turn, and a settled turn's token stops working", async () => {
		const { agent, turn, token } = await agentWithChannel(admin);
		const again = await person(admin).agent.startDirectTurn({
			agentId: agent.id,
		});
		expect(again).toEqual({ ...turn, started: false });
		await worker().agentWorker.settleTurn({
			turnId: turn.turnId,
			status: "completed",
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
		});
		const first = await person(admin).agent.startDirectTurn({
			agentId: agent.id,
			promptId: "prompt-1",
		});
		expect(first.started).toBe(true);
		await worker().agentWorker.settleTurn({
			turnId: first.turnId,
			status: "completed",
			reply: "done",
			inputTokens: 10,
		});
		const resent = await person(admin).agent.startDirectTurn({
			agentId: agent.id,
			promptId: "prompt-1",
		});
		expect(resent).toEqual({ ...first, started: false });
		const [row] = await db
			.select()
			.from(schema.agentTurns)
			.where(eq(schema.agentTurns.id, first.turnId));
		expect(row).toMatchObject({ reply: "done", inputTokens: 10 });
		const next = await person(admin).agent.startDirectTurn({
			agentId: agent.id,
			promptId: "prompt-2",
		});
		expect(next.started).toBe(true);
	});

	test("archiving an agent revokes it at once", async () => {
		const { agent, token } = await agentWithChannel(admin);
		await person(admin).agent.archive({ agentId: agent.id });
		await expect(asAgent(token).agentApi.me()).rejects.toThrow(
			"Turn is not running.",
		);
	});

	test("only org admins create agents, and the worker needs its secret", async () => {
		await expect(
			person(outsider).agent.create({ organizationId: orgId, name: "No" }),
		).rejects.toThrow("Only organization admins can manage agents");
		await expect(
			withHeaders({ "x-agent-worker-secret": "wrong" }).agentWorker.turnToken({
				turnId: crypto.randomUUID(),
			}),
		).rejects.toThrow("Unknown worker.");
	});
});
