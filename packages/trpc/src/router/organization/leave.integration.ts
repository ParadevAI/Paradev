import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import {
	cloudWorkspaceShares,
	cloudWorkspaces,
	environments,
	members,
	organizations,
	pageShares,
	pages,
	users,
} from "@superset/db/schema";
import { sessions } from "@superset/db/schema/auth";
import { eq, inArray } from "drizzle-orm";
import {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
} from "../../trpc";
import { organizationRouter } from "./organization";

const LEFT_ORG = crypto.randomUUID();
const KEPT_ORG = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const LEAVER = crypto.randomUUID();
const SESSION_TOKEN = `leave-${crypto.randomUUID()}`;
const suffix = Date.now();

const leaverCaller = createCallerFactory(
	createTRPCRouter({ organization: organizationRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: LEAVER, email: `leaver-${suffix}@example.com` },
			session: { activeOrganizationId: LEFT_ORG },
		} as never,
		auth,
		headers: new Headers({ authorization: `Bearer ${SESSION_TOKEN}` }),
	}),
);

async function seedSharedResources(organizationId: string) {
	const [environment] = await db
		.insert(environments)
		.values({
			organizationId,
			name: "default",
			sourceKind: "image",
			sourceRef: "image",
			bundleSha: "sha",
		})
		.returning({ id: environments.id });
	const workspaceId = crypto.randomUUID();
	await db.insert(cloudWorkspaces).values({
		id: workspaceId,
		organizationId,
		name: "box",
		branch: "main",
		baseBranch: "main",
		providerSandboxId: `box-${workspaceId}`,
		environmentId: environment?.id as string,
		visibility: "just_me",
		createdByUserId: OWNER,
	});
	const pageId = crypto.randomUUID();
	await db.insert(pages).values({
		id: pageId,
		slug: `leave-page-${pageId}`,
		organizationId,
		createdByUserId: OWNER,
		title: "Shared page",
		visibility: "just_me",
	});
	await db.insert(cloudWorkspaceShares).values({
		cloudWorkspaceId: workspaceId,
		userId: LEAVER,
		sharedByUserId: OWNER,
	});
	await db.insert(pageShares).values({
		pageId,
		userId: LEAVER,
		sharedByUserId: OWNER,
	});
}

async function leaverShares() {
	const pageRows = await db
		.select({ organizationId: pages.organizationId })
		.from(pageShares)
		.innerJoin(pages, eq(pages.id, pageShares.pageId))
		.where(eq(pageShares.userId, LEAVER));
	const workspaceRows = await db
		.select({ organizationId: cloudWorkspaces.organizationId })
		.from(cloudWorkspaceShares)
		.innerJoin(
			cloudWorkspaces,
			eq(cloudWorkspaces.id, cloudWorkspaceShares.cloudWorkspaceId),
		)
		.where(eq(cloudWorkspaceShares.userId, LEAVER));
	return {
		pageShares: pageRows.map((row) => row.organizationId),
		cloudWorkspaceShares: workspaceRows.map((row) => row.organizationId),
	};
}

beforeAll(async () => {
	await db.insert(organizations).values([
		{ id: LEFT_ORG, name: "Left Org", slug: `left-org-${suffix}` },
		{ id: KEPT_ORG, name: "Kept Org", slug: `kept-org-${suffix}` },
	]);
	await db.insert(users).values([
		{ id: OWNER, name: "Owner", email: `owner-${suffix}@example.com` },
		{ id: LEAVER, name: "Leaver", email: `leaver-${suffix}@example.com` },
	]);
	await db.insert(members).values(
		[LEFT_ORG, KEPT_ORG].flatMap((organizationId) => [
			{ organizationId, userId: OWNER, role: "owner" },
			{ organizationId, userId: LEAVER, role: "member" },
		]),
	);
	await db.insert(sessions).values({
		token: SESSION_TOKEN,
		userId: LEAVER,
		activeOrganizationId: LEFT_ORG,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
	});
	await seedSharedResources(LEFT_ORG);
	await seedSharedResources(KEPT_ORG);
});

afterAll(async () => {
	await db
		.delete(organizations)
		.where(inArray(organizations.id, [LEFT_ORG, KEPT_ORG]));
	await db.delete(users).where(inArray(users.id, [OWNER, LEAVER]));
	await dbWs.$client.end?.().catch(() => {});
});

describe("organization.leave", () => {
	test("drops the leaver's shares in that organization only", async () => {
		await leaverCaller.organization.leave({ organizationId: LEFT_ORG });

		expect(await leaverShares()).toEqual({
			pageShares: [KEPT_ORG],
			cloudWorkspaceShares: [KEPT_ORG],
		});
	});
});
