import { afterAll, beforeAll, expect, test } from "bun:test";

const { db, dbWs } = await import("@superset/db/client");
const { connections, members, organizations, users } = await import(
	"@superset/db/schema"
);
const { eq, inArray } = await import("drizzle-orm");
const { connectionConflict, ORGANIZATION_ABANDONED, upsertConnection } =
	await import("./upsert");
const { requireConnector } = await import("./index");

const suffix = Date.now();
const USER = crypto.randomUUID();
const ABANDONED_ORG = crypto.randomUUID();
const OTHER_ORG = crypto.randomUUID();
const NEW_ORG = crypto.randomUUID();
const ORGS = [ABANDONED_ORG, OTHER_ORG, NEW_ORG];
const ABANDONED_ACCOUNT = `linear-abandoned-${suffix}`;
const HELD_ACCOUNT = `linear-held-${suffix}`;

const liveRow = (organizationId: string, externalAccountId: string) => ({
	organizationId,
	connectedByUserId: USER,
	connector: "linear",
	ownerKind: "user",
	authMethod: "oauth2",
	accessToken: "sealed",
	externalAccountId,
	externalUserId: `linear-user-${suffix}`,
});

beforeAll(async () => {
	await db.insert(organizations).values(
		ORGS.map((id, i) => ({
			id,
			name: `Upsert Org ${i}`,
			slug: `upsert-org-${i}-${suffix}`,
		})),
	);
	await db.insert(users).values({
		id: USER,
		name: "Upsert User",
		email: `upsert-${suffix}@example.com`,
		organizationIds: [OTHER_ORG, NEW_ORG],
	});
	await db.insert(members).values(
		[OTHER_ORG, NEW_ORG].map((organizationId) => ({
			id: crypto.randomUUID(),
			organizationId,
			userId: USER,
			role: "owner",
			createdAt: new Date(),
		})),
	);
	await db
		.insert(connections)
		.values([
			liveRow(ABANDONED_ORG, ABANDONED_ACCOUNT),
			liveRow(OTHER_ORG, HELD_ACCOUNT),
		]);
});

afterAll(async () => {
	await db.delete(organizations).where(inArray(organizations.id, ORGS));
	await db.delete(users).where(eq(users.id, USER));
	await dbWs.$client.end?.().catch(() => {});
});

test("an account live in an organization with members is a conflict", async () => {
	expect(await connectionConflict("linear", HELD_ACCOUNT, NEW_ORG)).toEqual({
		ownerEmail: `upsert-${suffix}@example.com`,
	});
});

test("an organization with no members does not hold the account", async () => {
	expect(
		await connectionConflict("linear", ABANDONED_ACCOUNT, NEW_ORG),
	).toBeNull();

	const result = await upsertConnection({
		connector: requireConnector("linear"),
		slug: "linear",
		authMethod: "oauth2",
		organizationId: NEW_ORG,
		userId: USER,
		tokens: {
			accessToken: "token",
			refreshToken: null,
			expiresAt: null,
			scopes: null,
			stored: {},
			raw: {},
		},
		identity: {
			account: { id: ABANDONED_ACCOUNT, label: "Educato" },
			user: { id: `linear-user-${suffix}`, label: "roman" },
		},
	});
	expect(result.conflict).toBeUndefined();

	const [stale] = await db
		.select({
			disconnectedAt: connections.disconnectedAt,
			disconnectReason: connections.disconnectReason,
		})
		.from(connections)
		.where(eq(connections.organizationId, ABANDONED_ORG));
	expect(stale?.disconnectedAt).not.toBeNull();
	expect(stale?.disconnectReason).toBe(ORGANIZATION_ABANDONED);
});
