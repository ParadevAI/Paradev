import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("../../lib/r2", () => ({
	presignedGetUrl: async (key: string, seconds = 3600) =>
		`https://storage.test/${key}?expires=${seconds}`,
	presignedPutUrl: async ({ key }: { key: string }) => ({
		url: `https://storage.test/${key}`,
		headers: {},
	}),
	putObject: async () => {},
	getObject: async () => null,
	headObject: async () => null,
	copyObject: async () => {},
	listObjects: async () => [],
	deleteObjects: async () => {},
	objectExists: async () => true,
}));

const { db } = await import("@superset/db/client");
const schema = await import("@superset/db/schema");
const { inArray } = await import("drizzle-orm");
const { ORGANIZATION_HEADER } = await import("@superset/shared/constants");
const { env } = await import("../../env");
const { signTurnToken, TURN_TOKEN_HEADER } = await import(
	"../../lib/agent-turn/turn-token"
);
const { pageRouter } = await import("./page");
const { pageCommentRouter } = await import("../page-comment/page-comment");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const HOME = crypto.randomUUID();
const AWAY = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const OUTSIDER = crypto.randomUUID();
const BOTH = crypto.randomUUID();
const TEAMMATE = crypto.randomUUID();
const suffix = Date.now();
const slug = (name: string) => `read-${name}-${suffix}`;

const PUBLIC = crypto.randomUUID();
const ORG_ONLY = crypto.randomUUID();
const TAKEN_DOWN = crypto.randomUUID();
const AWAY_PAGE = crypto.randomUUID();

const router = createTRPCRouter({
	page: pageRouter,
	pageComment: pageCommentRouter,
});
const factory = createCallerFactory(router);

const person = (
	userId: string,
	activeOrganizationId: string | null,
	headers = new Headers(),
) =>
	factory(
		createTRPCContext({
			session: {
				user: { id: userId, email: `read-${userId}@example.com` },
				session: { activeOrganizationId },
			} as never,
			auth: {} as never,
			headers,
		}),
	);

const signedOut = (headers = new Headers()) =>
	factory(createTRPCContext({ session: null, auth: {} as never, headers }));

const devTurns: { turnId: string; sessionId: string; askerId: string }[] = [];
const AGENT = crypto.randomUUID();

async function dev(askerId: string) {
	const turn = devTurns.find((entry) => entry.askerId === askerId);
	if (!turn) throw new Error(`no turn for ${askerId}`);
	const token = await signTurnToken(env.AGENT_TURN_SIGNING_SECRET, {
		turnId: turn.turnId,
		sessionId: turn.sessionId,
		agentId: AGENT,
		organizationId: AWAY,
		actingUserId: askerId,
	});
	return factory(
		createTRPCContext({
			session: null,
			auth: {} as never,
			headers: new Headers({ [TURN_TOKEN_HEADER]: token }),
		}),
	);
}

beforeAll(async () => {
	await db.insert(schema.organizations).values([
		{ id: HOME, name: "Home Org", slug: slug("home") },
		{ id: AWAY, name: "Away Org", slug: slug("away") },
	]);
	const people = [
		{ id: OWNER, orgs: [HOME] },
		{ id: OUTSIDER, orgs: [AWAY] },
		{ id: BOTH, orgs: [HOME, AWAY] },
		{ id: TEAMMATE, orgs: [AWAY] },
	];
	await db.insert(schema.users).values(
		people.map(({ id, orgs }) => ({
			id,
			name: `User ${id.slice(0, 4)}`,
			email: `read-${id}@example.com`,
			organizationIds: orgs,
		})),
	);
	await db.insert(schema.members).values(
		people.flatMap(({ id, orgs }) =>
			orgs.map((organizationId) => ({
				id: crypto.randomUUID(),
				organizationId,
				userId: id,
				role: "member",
				createdAt: new Date(),
			})),
		),
	);

	await db.insert(schema.pages).values([
		{
			id: PUBLIC,
			slug: slug("public"),
			organizationId: HOME,
			createdByUserId: OWNER,
			title: "Public",
			visibility: "everyone",
			sharedVersion: 1,
			takenDownByUserId: OWNER,
			takenDownNote: "Restored after review",
			watchedByAgent: "claude",
			watchHeartbeatAt: new Date(),
		},
		{
			id: ORG_ONLY,
			slug: slug("org"),
			organizationId: HOME,
			createdByUserId: OWNER,
			title: "Org only",
			visibility: "org",
		},
		{
			id: TAKEN_DOWN,
			slug: slug("taken-down"),
			organizationId: HOME,
			createdByUserId: OWNER,
			title: "Taken down",
			visibility: "everyone",
			takenDownAt: new Date(),
		},
		{
			id: AWAY_PAGE,
			slug: slug("away-page"),
			organizationId: AWAY,
			createdByUserId: OUTSIDER,
			title: "Away page",
			visibility: "just_me",
		},
	]);
	const versions = [
		[PUBLIC, 1],
		[PUBLIC, 2],
		[ORG_ONLY, 1],
		[TAKEN_DOWN, 1],
		[AWAY_PAGE, 1],
	] as const;
	const rows = await db
		.insert(schema.pageVersions)
		.values(
			versions.map(([pageId, version]) => ({
				pageId,
				version,
				storageKey: `pages/${pageId}/${version}.html`,
				contentType: "text/html",
				sizeBytes: 1,
				sha256: "0",
				createdByUserId: OWNER,
			})),
		)
		.returning();
	const publicV1 = rows.find(
		(row) => row.pageId === PUBLIC && row.version === 1,
	);
	if (!publicV1) throw new Error("missing public v1");
	const [thread] = await db
		.insert(schema.pageCommentThreads)
		.values({
			pageId: PUBLIC,
			pageVersionId: publicV1.id,
			anchorKind: "page",
			createdByUserId: OWNER,
		})
		.returning();
	if (!thread) throw new Error("missing thread");
	await db.insert(schema.pageComments).values({
		threadId: thread.id,
		authorUserId: OWNER,
		body: "Only the organization sees this",
	});

	await db.insert(schema.agents).values({
		id: AGENT,
		organizationId: AWAY,
		name: "Read Dev",
		createdByUserId: OUTSIDER,
	});
	for (const askerId of [OUTSIDER, TEAMMATE]) {
		const [session] = await db
			.insert(schema.agentSessions)
			.values({
				organizationId: AWAY,
				agentId: AGENT,
				kind: "dm",
				userId: askerId,
			})
			.returning();
		if (!session) throw new Error("missing session");
		const [turn] = await db
			.insert(schema.agentTurns)
			.values({
				organizationId: AWAY,
				agentId: AGENT,
				sessionId: session.id,
				reason: "direct_message",
				actingUserId: askerId,
			})
			.returning();
		if (!turn) throw new Error("missing turn");
		devTurns.push({ turnId: turn.id, sessionId: session.id, askerId });
	}
});

afterAll(async () => {
	await db
		.delete(schema.organizations)
		.where(inArray(schema.organizations.id, [HOME, AWAY]));
	await db
		.delete(schema.users)
		.where(inArray(schema.users.id, [OWNER, OUTSIDER, BOTH, TEAMMATE]));
});

describe("a signed-in reader outside the organization", () => {
	const outsider = () => person(OUTSIDER, AWAY);

	test("gets a public page without member details", async () => {
		const page = await outsider().page.get({ slug: slug("public") });
		expect(page.member).toBe(false);
		expect(page.canEdit).toBe(false);
		expect(page.latestVersion).toBe(1);
		expect(page.servedVersion).toBe(1);
		expect(page.workspaceLinks).toEqual([]);
		expect(page.watch).toEqual({ watching: false, agentId: null });
		expect(page.viewUrl).not.toContain("/~");
		expect(page).toMatchObject({
			createdByUserId: null,
			organizationRole: "view",
			takenDownByUserId: null,
			takenDownNote: null,
			watchedByAgent: null,
			watchHeartbeatAt: null,
		});
	});

	test("pulls only the served version, with a five-minute link", async () => {
		const pulled = await outsider().page.pull({ slug: slug("public") });
		expect(pulled.member).toBe(false);
		expect(pulled.version).toBe(1);
		expect(pulled.latestVersion).toBe(1);
		expect(pulled.downloadUrl).toEndWith("?expires=300");
		expect(pulled.viewUrl).not.toContain("/~");
		expect(pulled.createdByUserId).toBeNull();
		await expect(
			outsider().page.pull({ slug: slug("public"), version: 2 }),
		).rejects.toThrow("Version 2 not found");
	});

	test("sees only the served version in the history", async () => {
		const versions = await outsider().page.versions({ id: PUBLIC });
		expect(versions.map((row) => row.version)).toEqual([1]);
		expect(versions[0]?.createdByUserId).toBeNull();
		expect(versions[0]?.thumbnailUrl).not.toContain("ticket=");
	});

	test("may not comment, edit or manage", async () => {
		expect(await outsider().page.access({ id: PUBLIC })).toMatchObject({
			owner: null,
			canComment: false,
			canEdit: false,
			canManage: false,
			member: false,
		});
	});

	test("sees no grantees and no comments", async () => {
		expect(await outsider().page.sharing.get({ id: PUBLIC })).toMatchObject({
			owner: null,
			grantees: [],
			canManage: false,
			organizationRole: "view",
		});
		expect(await outsider().pageComment.list({ pageId: PUBLIC })).toEqual([]);
	});

	test("cannot change a public page", async () => {
		await expect(
			outsider().page.update({ id: PUBLIC, title: "Mine now" }),
		).rejects.toThrow("Page not found");
	});

	test("cannot read an organization page or a taken-down one", async () => {
		await expect(outsider().page.get({ slug: slug("org") })).rejects.toThrow(
			"Page not found",
		);
		await expect(
			outsider().page.get({ slug: slug("taken-down") }),
		).rejects.toThrow("Page not found");
		await expect(
			outsider().pageComment.list({ pageId: ORG_ONLY }),
		).rejects.toThrow("Page not found");
	});

	test("cannot reach a taken-down page through any read", async () => {
		const reads = [
			() => outsider().page.pull({ id: TAKEN_DOWN }),
			() => outsider().page.versions({ id: TAKEN_DOWN }),
			() => outsider().page.access({ id: TAKEN_DOWN }),
			() => outsider().page.sharing.get({ id: TAKEN_DOWN }),
			() => outsider().pageComment.list({ pageId: TAKEN_DOWN }),
		];
		for (const read of reads) await expect(read()).rejects.toThrow("not found");
	});

	test("cannot read another organization's just-me page", async () => {
		await expect(
			person(OWNER, HOME).page.get({ slug: slug("away-page") }),
		).rejects.toThrow("Page not found");
	});

	test("reads a public page with no organization active", async () => {
		const unattached = person(OUTSIDER, null);
		expect((await unattached.page.get({ slug: slug("public") })).member).toBe(
			false,
		);
		expect((await unattached.page.pull({ slug: slug("public") })).version).toBe(
			1,
		);
		expect(await unattached.page.sharing.get({ id: PUBLIC })).toMatchObject({
			grantees: [],
			canManage: false,
		});
		expect(await unattached.pageComment.list({ pageId: PUBLIC })).toEqual([]);
		await expect(unattached.page.get({ slug: slug("org") })).rejects.toThrow(
			"No active organization selected",
		);
		await expect(unattached.page.sharing.get({ id: ORG_ONLY })).rejects.toThrow(
			"No active organization selected",
		);
		await expect(
			unattached.pageComment.list({ pageId: ORG_ONLY }),
		).rejects.toThrow("No active organization selected");
	});

	test("reads a public page with an organization it has left active", async () => {
		const removed = person(OUTSIDER, HOME);
		expect((await removed.page.get({ slug: slug("public") })).member).toBe(
			false,
		);
		expect(await removed.page.sharing.get({ id: PUBLIC })).toMatchObject({
			grantees: [],
			canManage: false,
		});
		expect(await removed.pageComment.list({ pageId: PUBLIC })).toEqual([]);
		await expect(removed.page.sharing.get({ id: ORG_ONLY })).rejects.toThrow(
			"Not a member of this organization",
		);
		await expect(
			removed.pageComment.list({ pageId: ORG_ONLY }),
		).rejects.toThrow("Not a member of this organization");
		await expect(removed.page.get({ slug: slug("org") })).rejects.toThrow(
			"Not a member of this organization",
		);
	});
});

describe("a member of the organization", () => {
	test("reads every version and the comments", async () => {
		const owner = person(OWNER, HOME);
		const page = await owner.page.get({ slug: slug("public") });
		expect(page.member).toBe(true);
		expect(page.latestVersion).toBe(2);
		expect(page.viewUrl).toContain("/~");
		expect(page.watch.watching).toBe(true);
		expect(page).toMatchObject({
			createdByUserId: OWNER,
			organizationRole: "comment",
			takenDownNote: "Restored after review",
			watchedByAgent: "claude",
		});
		const pulled = await owner.page.pull({ slug: slug("public"), version: 2 });
		expect(pulled.member).toBe(true);
		expect(pulled.createdByUserId).toBe(OWNER);
		expect(pulled.downloadUrl).toEndWith("?expires=3600");
		const versions = await owner.page.versions({ id: PUBLIC });
		expect(versions.map((row) => row.version)).toEqual([2, 1]);
		expect(versions[0]?.createdByUserId).toBe(OWNER);
		expect(await owner.pageComment.list({ pageId: PUBLIC })).toHaveLength(1);
	});

	test("reads as a member when its key names the page's organization", async () => {
		const page = await person(
			BOTH,
			AWAY,
			new Headers({ [ORGANIZATION_HEADER]: HOME }),
		).page.get({ slug: slug("org") });
		expect(page.member).toBe(true);
	});

	test("an outsider's key cannot name the page's organization", async () => {
		await expect(
			person(
				OUTSIDER,
				AWAY,
				new Headers({ [ORGANIZATION_HEADER]: HOME }),
			).page.get({ slug: slug("public") }),
		).rejects.toThrow("Not a member of organization");
	});

	test("with another organization active, reads a public page as an outsider and is told to switch for other versions", async () => {
		const elsewhere = person(BOTH, AWAY);
		expect((await elsewhere.page.get({ slug: slug("public") })).member).toBe(
			false,
		);
		await expect(
			elsewhere.page.pull({ slug: slug("public"), version: 2 }),
		).rejects.toThrow("This page belongs to Home Org");
	});
});

describe("a Dev", () => {
	test("its owner asking reads a public page elsewhere and their own pages", async () => {
		const forOwner = await dev(OUTSIDER);
		expect((await forOwner.page.get({ slug: slug("public") })).member).toBe(
			false,
		);
		expect((await forOwner.page.get({ slug: slug("away-page") })).member).toBe(
			true,
		);
	});

	test("anyone else asking reads only public pages", async () => {
		const forTeammate = await dev(TEAMMATE);
		const page = await forTeammate.page.get({ slug: slug("public") });
		expect(page.member).toBe(false);
		expect(
			(await forTeammate.page.pull({ slug: slug("public") })).downloadUrl,
		).toEndWith("?expires=300");
		expect(
			(await forTeammate.page.versions({ id: PUBLIC })).map(
				(row) => row.version,
			),
		).toEqual([1]);
		await expect(
			forTeammate.page.get({ slug: slug("away-page") }),
		).rejects.toThrow("A Dev reads and changes pages only for its owner");
	});
});

describe("signed out", () => {
	test("publicView carries a five-minute download link when asked", async () => {
		const view = await signedOut().page.publicView({
			slug: slug("public"),
			download: true,
		});
		expect(view?.version).toBe(1);
		expect(view?.downloadUrl).toEndWith("?expires=300");
		expect(
			(await signedOut().page.publicView({ slug: slug("public") }))
				?.downloadUrl,
		).toBeNull();
		expect(
			await signedOut().page.publicView({ slug: slug("taken-down") }),
		).toBeNull();
	});
});
