import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import {
	automations,
	cloudWorkspaceShares,
	cloudWorkspaces,
	environments,
	members,
	organizations,
	pageShares,
	pages,
	users,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { sessions } from "@superset/db/schema/auth";
import { eq, inArray } from "drizzle-orm";
import {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
} from "../../trpc";
import { organizationRouter } from "./organization";

const OWNER = crypto.randomUUID();
const LEAVER = crypto.randomUUID();
const SESSION_TOKEN = `leave-${crypto.randomUUID()}`;
const headers = new Headers({ authorization: `Bearer ${SESSION_TOKEN}` });
const suffix = Date.now();
const LEFT_VIA_TRPC = crypto.randomUUID();
const STAYED_IN = crypto.randomUUID();
const LEFT_VIA_AUTH = crypto.randomUUID();
const ORGS = [LEFT_VIA_TRPC, STAYED_IN, LEFT_VIA_AUTH];

const leaverCaller = createCallerFactory(
	createTRPCRouter({ organization: organizationRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: LEAVER, email: `leaver-${suffix}@example.com` },
			session: { activeOrganizationId: null },
		} as never,
		auth,
		headers,
	}),
);

/** An organization where the leaver has a shared page, a shared cloud workspace, an automation and a host only they own. */
async function seedOrg(organizationId: string) {
	await db.insert(organizations).values({
		id: organizationId,
		name: "Leave Org",
		slug: `leave-org-${organizationId}`,
	});
	await db.insert(members).values([
		{ organizationId, userId: OWNER, role: "owner" },
		{ organizationId, userId: LEAVER, role: "member" },
	]);
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
	await db.insert(automations).values({
		organizationId,
		ownerUserId: LEAVER,
		name: "Nightly",
		prompt: "Run the nightly report",
		agent: "claude",
	});
	const machineId = `machine-${organizationId}`;
	await db
		.insert(v2Hosts)
		.values({ organizationId, machineId, name: "Leaver laptop" });
	await db.insert(v2UsersHosts).values({
		organizationId,
		userId: LEAVER,
		hostId: machineId,
		role: "owner",
	});
}

/** Per organization: the leaver's shares and hosts, and whether any of their automations is still enabled. */
async function leaverState(organizationId: string) {
	const [pageRows, workspaceRows, automationRows, hostRows] = await Promise.all(
		[
			db
				.select({ id: pageShares.id })
				.from(pageShares)
				.innerJoin(pages, eq(pages.id, pageShares.pageId))
				.where(eq(pages.organizationId, organizationId)),
			db
				.select({ id: cloudWorkspaceShares.id })
				.from(cloudWorkspaceShares)
				.innerJoin(
					cloudWorkspaces,
					eq(cloudWorkspaces.id, cloudWorkspaceShares.cloudWorkspaceId),
				)
				.where(eq(cloudWorkspaces.organizationId, organizationId)),
			db
				.select({ enabled: automations.enabled })
				.from(automations)
				.where(eq(automations.organizationId, organizationId)),
			db
				.select({ machineId: v2Hosts.machineId })
				.from(v2Hosts)
				.where(eq(v2Hosts.organizationId, organizationId)),
		],
	);
	return {
		pageShares: pageRows.length,
		cloudWorkspaceShares: workspaceRows.length,
		automationsEnabled: automationRows.some((row) => row.enabled),
		hosts: hostRows.length,
	};
}

const LEFT = {
	pageShares: 0,
	cloudWorkspaceShares: 0,
	automationsEnabled: false,
	hosts: 0,
};
const STAYED = {
	pageShares: 1,
	cloudWorkspaceShares: 1,
	automationsEnabled: true,
	hosts: 1,
};

beforeAll(async () => {
	await db.insert(users).values([
		{ id: OWNER, name: "Owner", email: `owner-${suffix}@example.com` },
		{ id: LEAVER, name: "Leaver", email: `leaver-${suffix}@example.com` },
	]);
	await db.insert(sessions).values({
		token: SESSION_TOKEN,
		userId: LEAVER,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
	});
	await Promise.all(ORGS.map(seedOrg));
});

afterAll(async () => {
	await db.delete(organizations).where(inArray(organizations.id, ORGS));
	await db.delete(users).where(inArray(users.id, [OWNER, LEAVER]));
	await dbWs.$client.end?.().catch(() => {});
});

describe("leaving an organization", () => {
	test("organization.leave cleans up after the leaver in that organization only and reports it", async () => {
		const result = await leaverCaller.organization.leave({
			organizationId: LEFT_VIA_TRPC,
		});

		expect(result.cleanup).toEqual({ automations: 1, hosts: 1 });
		expect(
			await Promise.all([leaverState(LEFT_VIA_TRPC), leaverState(STAYED_IN)]),
		).toEqual([LEFT, STAYED]);
	});

	test("better-auth's own leave route cleans up after the leaver too", async () => {
		await auth.api.leaveOrganization({
			body: { organizationId: LEFT_VIA_AUTH },
			headers,
		});

		expect(await leaverState(LEFT_VIA_AUTH)).toEqual(LEFT);
	});
});
