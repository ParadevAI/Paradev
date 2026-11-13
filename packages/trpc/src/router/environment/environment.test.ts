import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as plan from "../../lib/billing/plan";
import * as guards from "../../lib/cloud-guards";
import { userError } from "../../trpc";
import * as integration from "../integration/utils";

const ENVIRONMENT_ID = "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c";
const ORGANIZATION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

let environment: Record<string, unknown> = {};
let isAdmin = false;
let written: Record<string, unknown>[] = [];

stub(db.query.environments, { findFirst: async () => environment });
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => {
			written.push(values);
			return {
				where: () => ({
					returning: async () => [{ ...environment, ...values }],
				}),
			};
		},
	}),
});
stub(guards, {
	isMember: async () => true,
	assertMember: async () => {},
	assertCloudAccess: async () => {},
});
stub(integration, {
	verifyOrgAdmin: async () => {
		if (!isAdmin) {
			throw userError({
				code: "FORBIDDEN",
				message: "Admin access required",
				i18nKey: "serverError.integration.adminAccessRequired",
			});
		}
	},
});
stub(plan, {
	resolveMachineSize: async (_: string, name: string | null | undefined) =>
		name === "large" || name == null
			? { name: name ?? "medium", vcpus: 8 }
			: null,
});

const { environmentRouter } = await import("./environment");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(
	createTRPCRouter({ environment: environmentRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: "user-1", email: "user@example.com" },
			session: { activeOrganizationId: ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
		sandboxCaller: null,
	}),
);

beforeEach(() => {
	environment = {
		id: ENVIRONMENT_ID,
		organizationId: ORGANIZATION_ID,
		scope: "organization",
		createdByUserId: "someone-else",
		sourceKind: "image",
		machineSize: "large",
	};
	isAdmin = false;
	written = [];
});

describe("environment.update machineSize", () => {
	test("a member who neither created nor administers a shared environment cannot change its size", async () => {
		await expect(
			caller.environment.update({ id: ENVIRONMENT_ID, machineSize: "large" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(written).toEqual([]);
	});

	test("null goes back to the organization's default", async () => {
		isAdmin = true;
		await caller.environment.update({ id: ENVIRONMENT_ID, machineSize: null });
		expect(written).toEqual([{ machineSize: null }]);
	});

	test("refuses a size the plan does not offer", async () => {
		environment.createdByUserId = "user-1";
		await expect(
			caller.environment.update({ id: ENVIRONMENT_ID, machineSize: "2xlarge" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(written).toEqual([]);
	});
});
