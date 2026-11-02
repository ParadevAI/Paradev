import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import type { TRPCError } from "@trpc/server";
import { stub } from "../test/stub";
import { posthog } from "./lib/analytics";

const CREATOR_ORGS = ["box-org", "other-org"];
let membership: { id: string } | undefined = { id: "membership" };

stub(db.query.members, {
	findMany: async () =>
		CREATOR_ORGS.map((organizationId) => ({ organizationId })),
	findFirst: async () => membership,
});
stub(posthog, { capture: () => {}, isFeatureEnabled: async () => false });

const {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	personProcedure,
} = await import("./trpc");
const { isMember } = await import("./lib/cloud-guards");

const reached = personProcedure.mutation(() => "reached");

const router = createTRPCRouter({
	cloudWorkspace: createTRPCRouter({
		list: personProcedure.query(async ({ ctx }) => {
			const visible: string[] = [];
			for (const id of CREATOR_ORGS) {
				if (await isMember(ctx, id)) visible.push(id);
			}
			return visible;
		}),
		delete: reached,
		rename: reached,
		setDescription: reached,
		sleep: reached,
		unarchive: reached,
		setVisibility: reached,
		restart: reached,
	}),
	user: createTRPCRouter({
		myOrganization: personProcedure.query(
			({ ctx }) => ctx.activeOrganizationId,
		),
	}),
});

const BOX = {
	workspaceId: "box",
	organizationId: "box-org",
	userId: "creator",
};

const session = {
	user: { id: "creator", email: "creator@example.com" },
	session: { activeOrganizationId: "box-org" },
};

const callerFor = ({
	sandboxCaller = BOX as typeof BOX | null,
	organization,
	tokenOrganizations,
}: {
	sandboxCaller?: typeof BOX | null;
	organization?: string;
	tokenOrganizations?: string[];
} = {}) => {
	const headers = new Headers();
	if (organization) headers.set("x-superset-organization-id", organization);
	return createCallerFactory(router)(
		createTRPCContext({
			session: (tokenOrganizations
				? {
						...session,
						session: {
							activeOrganizationId: null,
							organizationIds: tokenOrganizations,
						},
					}
				: session) as never,
			auth: {} as never,
			headers,
			sandboxCaller,
		}),
	);
};

const outcome = async (call: () => Promise<unknown>) => {
	try {
		return await call();
	} catch (error) {
		return (error as TRPCError).code;
	}
};

describe("what a cloud workspace may call", () => {
	const box = callerFor();

	test.each([
		["delete", () => box.cloudWorkspace.delete()],
		["rename", () => box.cloudWorkspace.rename()],
		["setDescription", () => box.cloudWorkspace.setDescription()],
		["sleep", () => box.cloudWorkspace.sleep()],
	])("a box reaches cloudWorkspace.%s", async (_name, call) => {
		expect(await outcome(call)).toBe("reached");
	});

	test.each([
		["unarchive", () => box.cloudWorkspace.unarchive()],
		["setVisibility", () => box.cloudWorkspace.setVisibility()],
		["restart", () => box.cloudWorkspace.restart()],
	])("a box is refused cloudWorkspace.%s", async (_name, call) => {
		expect(await outcome(call)).toBe("FORBIDDEN");
	});

	test("a signed-in client is not narrowed", async () => {
		const client = callerFor({ sandboxCaller: null });
		expect(await outcome(() => client.cloudWorkspace.setVisibility())).toBe(
			"reached",
		);
	});
});

describe("the organization a cloud workspace acts in", () => {
	test("a box is a member of its own organization only", async () => {
		expect(await callerFor().cloudWorkspace.list()).toEqual(["box-org"]);
	});

	test("a box may not name another of its creator's organizations", async () => {
		expect(
			await outcome(() =>
				callerFor({ organization: "other-org" }).user.myOrganization(),
			),
		).toBe("FORBIDDEN");
	});

	test("a box may name its own organization", async () => {
		const box = callerFor({ organization: "box-org" });
		expect(await box.user.myOrganization()).toBe("box-org");
		expect(await box.cloudWorkspace.list()).toEqual(["box-org"]);
	});

	test("a signed-in client keeps every organization it belongs to", async () => {
		const client = callerFor({
			sandboxCaller: null,
			organization: "other-org",
		});
		expect(await client.cloudWorkspace.list()).toEqual(CREATOR_ORGS);
		expect(await client.user.myOrganization()).toBe("other-org");
	});
});

describe("a bearer's token", () => {
	test("vouches for the organizations it lists without a lookup", async () => {
		membership = undefined;
		try {
			const bearer = callerFor({
				sandboxCaller: null,
				organization: "other-org",
				tokenOrganizations: ["other-org"],
			});
			expect(await bearer.user.myOrganization()).toBe("other-org");
			expect(await bearer.cloudWorkspace.list()).toEqual(["other-org"]);
		} finally {
			membership = { id: "membership" };
		}
	});

	test("an organization joined since the token was minted is looked up", async () => {
		const bearer = callerFor({
			sandboxCaller: null,
			organization: "other-org",
			tokenOrganizations: ["box-org"],
		});
		expect(await bearer.user.myOrganization()).toBe("other-org");
	});
});

describe("a caller outside the organization it asks for", () => {
	test("is told which account it is signed in as and how to fix it", async () => {
		membership = undefined;
		try {
			const client = callerFor({
				sandboxCaller: null,
				organization: "foreign-org",
			});
			const error = (await client.user
				.myOrganization()
				.catch((thrown: unknown) => thrown)) as TRPCError;
			expect(error.code).toBe("FORBIDDEN");
			expect(error.message).toContain("foreign-org");
			expect(error.message).toContain("creator@example.com");
			expect(error.message).toContain("superset auth login");
		} finally {
			membership = { id: "membership" };
		}
	});
});
