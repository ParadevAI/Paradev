import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import {
	members,
	organizations,
	pages,
	teamMembers,
	teams,
	users,
} from "@superset/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
} from "../../trpc";
import { pageRouter } from "./page";

const ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const SHAREE = crypto.randomUUID();
const TEAM = crypto.randomUUID();
const PAGE = crypto.randomUUID();
const suffix = Date.now();

const nudges: { path: string; authorization: string | null }[] = [];
let heard: (() => void) | null = null;
const realtime = Bun.serve({
	port: 0,
	fetch(request) {
		nudges.push({
			path: new URL(request.url).pathname,
			authorization: request.headers.get("authorization"),
		});
		heard?.();
		return Response.json({ ok: true });
	},
});
process.env.REALTIME_URL = `http://localhost:${realtime.port}`;
process.env.REALTIME_NUDGE_SECRET = "sharing-test-secret";

const nudged = async (change: () => Promise<unknown>) => {
	nudges.length = 0;
	const arrived = new Promise<void>((resolve) => {
		heard = resolve;
	});
	await change();
	await Promise.race([arrived, Bun.sleep(1000)]);
	return nudges.slice();
};

const expected = {
	path: `/v2/page/${PAGE}/storage/manifest-changed`,
	authorization: "Bearer sharing-test-secret",
};

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
	await db
		.insert(teamMembers)
		.values({ teamId: TEAM, userId: SHAREE, organizationId: ORG });
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
	realtime.stop(true);
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(inArray(users.id, [OWNER, SHAREE]));
	await dbWs.$client.end?.().catch(() => {});
});

describe("page.sharing tells the page's realtime hub to ask again", () => {
	test("adding a share nudges the hub", async () => {
		expect(
			await nudged(() =>
				owner.page.sharing.add({
					id: PAGE,
					grantees: [
						{ kind: "user", userId: SHAREE },
						{ kind: "team", teamId: TEAM },
					],
					role: "view",
				}),
			),
		).toEqual([expected]);
	});

	test("changing a share's role nudges the hub", async () => {
		expect(
			await nudged(() =>
				owner.page.sharing.setRole({
					id: PAGE,
					grantee: { kind: "team", teamId: TEAM },
					role: "comment",
				}),
			),
		).toEqual([expected]);
	});

	test("removing a share nudges the hub", async () => {
		expect(
			await nudged(() =>
				owner.page.sharing.remove({
					id: PAGE,
					grantee: { kind: "user", userId: SHAREE },
				}),
			),
		).toEqual([expected]);
	});
});
