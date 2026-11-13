import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import {
	members,
	organizations,
	pageShares,
	pages,
	teamMembers,
	teams,
	users,
} from "@superset/db/schema";
import { eq, inArray } from "drizzle-orm";
import { POST } from "./route";

const ORG = crypto.randomUUID();
const OTHER_ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const SHAREE = crypto.randomUUID();
const TEAMMATE = crypto.randomUUID();
const MEMBER = crypto.randomUUID();
const OUTSIDER = crypto.randomUUID();
const TEAM = crypto.randomUUID();
const PRIVATE_PAGE = crypto.randomUUID();
const PUBLIC_PAGE = crypto.randomUUID();
const TAKEN_DOWN_PAGE = crypto.randomUUID();
const PEOPLE = [OWNER, SHAREE, TEAMMATE, MEMBER, OUTSIDER];
const suffix = Date.now();

const ask = async (pageId: string, userIds: string[]) => {
	const response = await POST(
		new Request("http://localhost/api/pages/access", {
			method: "POST",
			headers: { authorization: "Bearer test-nudge-secret" },
			body: JSON.stringify({ pageId, userIds }),
		}),
	);
	return {
		status: response.status,
		body: response.ok
			? ((await response.json()) as {
					guests: boolean;
					users: Record<
						string,
						{ read: boolean; write: boolean; author: boolean }
					>;
				})
			: null,
	};
};

const page = (id: string, extra: Partial<typeof pages.$inferInsert>) => ({
	id,
	slug: `access-${id.slice(0, 8)}-${suffix}`,
	organizationId: ORG,
	createdByUserId: OWNER,
	title: "Access",
	...extra,
});

beforeAll(async () => {
	await db.insert(organizations).values([
		{ id: ORG, name: "Access Org", slug: `access-org-${suffix}` },
		{ id: OTHER_ORG, name: "Other Org", slug: `access-other-${suffix}` },
	]);
	await db.insert(users).values(
		PEOPLE.map((id, index) => ({
			id,
			name: `Access ${index}`,
			email: `access-${index}-${suffix}@example.com`,
			organizationIds: [id === OUTSIDER ? OTHER_ORG : ORG],
		})),
	);
	await db.insert(members).values(
		PEOPLE.map((userId) => ({
			id: crypto.randomUUID(),
			organizationId: userId === OUTSIDER ? OTHER_ORG : ORG,
			userId,
			role: userId === OWNER ? "owner" : "member",
			createdAt: new Date(),
		})),
	);
	await db.insert(teams).values({
		id: TEAM,
		name: "Access Team",
		slug: `access-team-${suffix}`,
		organizationId: ORG,
	});
	await db
		.insert(teamMembers)
		.values({ teamId: TEAM, userId: TEAMMATE, organizationId: ORG });
	await db
		.insert(pages)
		.values([
			page(PRIVATE_PAGE, { visibility: "just_me" }),
			page(PUBLIC_PAGE, { visibility: "everyone" }),
			page(TAKEN_DOWN_PAGE, { visibility: "org", takenDownAt: new Date() }),
		]);
	await db.insert(pageShares).values([
		{
			pageId: PRIVATE_PAGE,
			userId: SHAREE,
			role: "view",
			sharedByUserId: OWNER,
		},
		{
			pageId: PRIVATE_PAGE,
			teamId: TEAM,
			role: "comment",
			sharedByUserId: OWNER,
		},
		{
			pageId: PRIVATE_PAGE,
			userId: OUTSIDER,
			role: "edit",
			sharedByUserId: OWNER,
		},
	]);
});

afterAll(async () => {
	await db
		.delete(organizations)
		.where(inArray(organizations.id, [ORG, OTHER_ORG]));
	await db.delete(users).where(inArray(users.id, PEOPLE));
	await dbWs.$client.end?.().catch(() => {});
});

describe("POST /api/pages/access", () => {
	test("answers per user on a just_me page, from the API's own access rule", async () => {
		const { status, body } = await ask(PRIVATE_PAGE, PEOPLE);
		expect(status).toBe(200);
		expect(body?.guests).toBe(false);
		expect(body?.users).toEqual({
			[OWNER]: { read: true, write: true, author: true },
			[SHAREE]: { read: true, write: true, author: false },
			[TEAMMATE]: { read: true, write: true, author: false },
			[MEMBER]: { read: false, write: false, author: false },
			[OUTSIDER]: { read: false, write: false, author: false },
		});
	});

	test("lets guests in on a page shared with everyone, and members read it", async () => {
		const { body } = await ask(PUBLIC_PAGE, [MEMBER, OUTSIDER]);
		expect(body?.guests).toBe(true);
		expect(body?.users[MEMBER]?.read).toBe(true);
		expect(body?.users[OUTSIDER]?.read).toBe(false);
	});

	test("answers the guest flag alone when asked about nobody", async () => {
		expect((await ask(PUBLIC_PAGE, [])).body).toEqual({
			guests: true,
			users: {},
		});
	});

	test("404s a page that is missing or taken down", async () => {
		expect((await ask(crypto.randomUUID(), [OWNER])).status).toBe(404);
		expect((await ask(TAKEN_DOWN_PAGE, [OWNER])).status).toBe(404);
	});

	test("a removed share stops counting on the next ask", async () => {
		await db.delete(pageShares).where(eq(pageShares.userId, SHAREE));
		expect((await ask(PRIVATE_PAGE, [SHAREE])).body?.users[SHAREE]?.read).toBe(
			false,
		);
	});
});
