import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import {
	invitations,
	organizations,
	pageShares,
	pages,
	teamMembers,
	teams,
	users,
} from "@superset/db/schema";
import { eq, inArray } from "drizzle-orm";
import { convertPendingShares, removeMemberShares } from "./pending-shares";
import { teamIdsFor } from "./team-ids";

const ORG = crypto.randomUUID();
const OTHER_ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const MEMBER = crypto.randomUUID();
const PAGE = crypto.randomUUID();
const TEAM = crypto.randomUUID();
const OTHER_TEAM = crypto.randomUUID();
const suffix = Date.now();
const inviteeEmail = `Invitee-${suffix}@Example.com`;

beforeAll(async () => {
	await db.insert(organizations).values([
		{ id: ORG, name: "Shares Org", slug: `shares-org-${suffix}` },
		{ id: OTHER_ORG, name: "Other Org", slug: `shares-other-${suffix}` },
	]);
	await db.insert(users).values(
		[OWNER, MEMBER].map((id, index) => ({
			id,
			name: `Shares User ${index}`,
			email: `shares-${index}-${suffix}@example.com`,
			organizationIds: [ORG],
		})),
	);
	await db.insert(teams).values([
		{ id: TEAM, name: "T", slug: `t-${suffix}`, organizationId: ORG },
		{
			id: OTHER_TEAM,
			name: "T2",
			slug: `t2-${suffix}`,
			organizationId: OTHER_ORG,
		},
	]);
	await db.insert(teamMembers).values([
		{ teamId: TEAM, userId: MEMBER, organizationId: ORG },
		{ teamId: OTHER_TEAM, userId: MEMBER, organizationId: OTHER_ORG },
	]);
	await db.insert(pages).values({
		id: PAGE,
		slug: `shares-page-${suffix}`,
		organizationId: ORG,
		createdByUserId: OWNER,
		title: "Shared",
		visibility: "just_me",
	});
});

afterAll(async () => {
	await db
		.delete(organizations)
		.where(inArray(organizations.id, [ORG, OTHER_ORG]));
	await db.delete(users).where(inArray(users.id, [OWNER, MEMBER]));
	await dbWs.$client.end?.().catch(() => {});
});

describe("share changes made outside the sharing router", () => {
	test("removing a member reports the pages whose shares it deleted", async () => {
		await db
			.insert(pageShares)
			.values({ pageId: PAGE, userId: MEMBER, sharedByUserId: OWNER });
		expect(
			await removeMemberShares({ organizationId: ORG, userId: MEMBER }),
		).toEqual([PAGE]);
	});

	test("converting an invitation reports the pages it now shares", async () => {
		const [invitation] = await db
			.insert(invitations)
			.values({
				organizationId: ORG,
				email: inviteeEmail,
				expiresAt: new Date(Date.now() + 86_400_000),
				inviterId: OWNER,
			})
			.returning({ id: invitations.id });
		if (!invitation) throw new Error("no invitation");
		await db.insert(pageShares).values({
			pageId: PAGE,
			invitationId: invitation.id,
			sharedByUserId: OWNER,
		});
		expect(
			await convertPendingShares({
				organizationId: ORG,
				userId: MEMBER,
				email: inviteeEmail.toLowerCase(),
			}),
		).toEqual([PAGE]);
		const [row] = await db
			.select({ userId: pageShares.userId })
			.from(pageShares)
			.where(eq(pageShares.pageId, PAGE));
		expect(row?.userId).toBe(MEMBER);
	});
});

describe("teamIdsFor", () => {
	test("lists every team, or only those in the given organizations", async () => {
		expect((await teamIdsFor(MEMBER)).sort()).toEqual(
			[TEAM, OTHER_TEAM].sort(),
		);
		expect(await teamIdsFor(MEMBER, [ORG])).toEqual([TEAM]);
		expect(await teamIdsFor(MEMBER, [])).toEqual([]);
	});
});
