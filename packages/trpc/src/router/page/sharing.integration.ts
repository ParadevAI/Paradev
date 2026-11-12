import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const objectStore = new Map<string, string>();
let failPuts = false;
mock.module("../../lib/r2", () => ({
	putObject: async ({ key, body }: { key: string; body: string }) => {
		if (failPuts) throw new Error("r2 down");
		objectStore.set(key, body);
	},
	deleteObjects: async (keys: string[]) => {
		for (const key of keys) objectStore.delete(key);
	},
	presignedGetUrl: async (key: string) => `https://storage.test/${key}`,
	presignedPutUrl: async ({ key }: { key: string }) => ({
		url: `https://storage.test/${key}`,
		headers: {},
	}),
	getObject: async () => null,
	headObject: async () => null,
	copyObject: async () => {},
	objectExists: async () => true,
	listObjects: async () => [],
}));

const { db, dbWs } = await import("@superset/db/client");
const { members, organizations, pageShares, pages, teamMembers, teams, users } =
	await import("@superset/db/schema");
const { parsePageManifest, pageManifestKey } = await import(
	"@superset/shared/usercontent"
);
const { eq, inArray } = await import("drizzle-orm");
const { pageRouter } = await import("./page");
const { rewritePageManifests } = await import("./manifests-job");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const SHAREE = crypto.randomUUID();
const TEAM = crypto.randomUUID();
const PAGE = crypto.randomUUID();
const suffix = Date.now();

const owner = createCallerFactory(createTRPCRouter({ page: pageRouter }))(
	createTRPCContext({
		session: {
			user: { id: OWNER, email: `share-owner-${suffix}@example.com` },
			session: { activeOrganizationId: ORG },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	}),
);

const manifest = () => {
	const text = objectStore.get(pageManifestKey(PAGE));
	return text === undefined ? null : parsePageManifest(text);
};

beforeAll(async () => {
	await db.insert(organizations).values({
		id: ORG,
		name: "Share Org",
		slug: `share-org-${suffix}`,
	});
	await db.insert(users).values(
		[OWNER, SHAREE].map((id, index) => ({
			id,
			name: `Share User ${index}`,
			email: `share-${index}-${suffix}@example.com`,
			organizationIds: [ORG],
		})),
	);
	await db.insert(members).values(
		[OWNER, SHAREE].map((userId) => ({
			id: crypto.randomUUID(),
			organizationId: ORG,
			userId,
			role: userId === OWNER ? "owner" : "member",
			createdAt: new Date(),
		})),
	);
	await db.insert(teams).values({
		id: TEAM,
		name: "Share Team",
		slug: `share-team-${suffix}`,
		organizationId: ORG,
	});
	await db.insert(teamMembers).values({ teamId: TEAM, userId: SHAREE });
	await db.insert(pages).values({
		id: PAGE,
		slug: `share-page-${suffix}`,
		organizationId: ORG,
		createdByUserId: OWNER,
		title: "Shared page",
		visibility: "just_me",
	});
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(inArray(users.id, [OWNER, SHAREE]));
	await dbWs.$client.end?.().catch(() => {});
});

describe("page.sharing and the manifest the realtime hub reads", () => {
	test("adding a share writes the grantees into the manifest", async () => {
		await owner.page.sharing.add({
			id: PAGE,
			grantees: [
				{ kind: "user", userId: SHAREE },
				{ kind: "team", teamId: TEAM },
			],
			role: "view",
		});
		expect(manifest()?.sharedUserIds).toEqual([SHAREE]);
		expect(manifest()?.sharedTeamIds).toEqual([TEAM]);
	});

	test("removing a share takes it out of the manifest", async () => {
		await owner.page.sharing.remove({
			id: PAGE,
			grantee: { kind: "user", userId: SHAREE },
		});
		expect(manifest()?.sharedUserIds).toEqual([]);
		expect(manifest()?.sharedTeamIds).toEqual([TEAM]);
	});
});

describe("when the manifest cannot be written", () => {
	test("a removed share is put back, so the database never says less than the hub enforces", async () => {
		failPuts = true;
		try {
			await expect(
				owner.page.sharing.remove({
					id: PAGE,
					grantee: { kind: "team", teamId: TEAM },
				}),
			).rejects.toThrow("r2 down");
		} finally {
			failPuts = false;
		}
		const rows = await db
			.select({ teamId: pageShares.teamId })
			.from(pageShares)
			.where(eq(pageShares.pageId, PAGE));
		expect(rows.map((row) => row.teamId)).toEqual([TEAM]);
	});

	test("a failed add leaves the sharee out of the manifest, and a retry lets them in", async () => {
		const add = () =>
			owner.page.sharing.add({
				id: PAGE,
				grantees: [{ kind: "user", userId: SHAREE }],
			});
		failPuts = true;
		try {
			await expect(add()).rejects.toThrow("r2 down");
		} finally {
			failPuts = false;
		}
		expect(manifest()?.sharedUserIds).toEqual([]);
		expect((await add()).added).toEqual([]);
		expect(manifest()?.sharedUserIds).toEqual([SHAREE]);
		await db.delete(pageShares).where(eq(pageShares.userId, SHAREE));
	});
});

describe("the manifests job", () => {
	test("rewrites a page whose share was deleted outside the router", async () => {
		await db
			.insert(pageShares)
			.values({ pageId: PAGE, userId: SHAREE, sharedByUserId: OWNER });
		await rewritePageManifests([PAGE]);
		expect(manifest()?.sharedUserIds).toEqual([SHAREE]);
		await db.delete(pageShares).where(eq(pageShares.userId, SHAREE));
		await rewritePageManifests([PAGE]);
		expect(manifest()?.sharedUserIds).toEqual([]);
	});
});
