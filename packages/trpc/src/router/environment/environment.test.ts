import { beforeEach, describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as plan from "../../lib/billing/plan";
import * as guards from "../../lib/cloud-guards";
import * as sandbox from "../../lib/sandbox";
import { userError } from "../../trpc";
import * as access from "../cloud-workspace/access";
import * as wake from "../cloud-workspace/wake";
import * as integration from "../integration/utils";
import * as currentBundle from "./current-bundle";
import * as limit from "./limit";

const ENVIRONMENT_ID = "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c";
const ORGANIZATION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const WORKSPACE_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

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
stub(access, {
	loadVisibleWorkspace: async () => ({
		id: WORKSPACE_ID,
		organizationId: ORGANIZATION_ID,
		environmentId: ENVIRONMENT_ID,
		status: "awake",
		baseBranch: "main",
		branch: "main",
	}),
});
let deletedBoxes: string[] = [];
stub(sandbox, {
	workspaceRepositories: async () => [],
	deleteSandbox: async (name: string) => {
		deletedBoxes.push(name);
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
	deletedBoxes = [];
});

describe("environment.archive", () => {
	test("only sets a status: the cleanup job deletes its golden (rule 2)", async () => {
		environment = {
			...environment,
			sourceKind: "fork",
			sourceRef: "env-golden",
		};
		expect(await caller.environment.archive({ id: ENVIRONMENT_ID })).toEqual({
			archived: true,
		});
		expect(written).toEqual([{ archivedAt: expect.any(Date) }]);
		expect(deletedBoxes).toEqual([]);
	});
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

describe("environment.promote onto an environment", () => {
	test("a member who neither created nor administers a shared environment cannot replace its checkpoint", async () => {
		await expect(
			caller.environment.promote({
				cloudWorkspaceId: WORKSPACE_ID,
				environmentId: ENVIRONMENT_ID,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(written).toEqual([]);
	});
});

describe("environment.promote of a running workspace", () => {
	const restarted: Array<[string, { sessionId: string | null }]> = [];
	const order: string[] = [];
	stub(sandbox, {
		promoteSandboxToEnvironment: async () => ({
			goldenName: "env-new",
			region: "iad1",
			stopped: { sessionId: "sess_A" },
		}),
		deleteSandbox: async () => {},
	});
	stub(wake, {
		wakeAfterStop: async (
			row: { id: string },
			stopped: { sessionId: string | null },
		) => {
			restarted.push([row.id, stopped]);
			order.push("restart");
			throw userError({
				code: "FORBIDDEN",
				message: "limit reached",
				i18nKey: "serverError.cloudWorkspace.usageLimitReached",
			});
		},
	});
	stub(db, {
		select: () => ({ from: () => ({ where: async () => [] }) }),
	});
	stub(limit, { assertEnvironmentCapacity: async () => null });
	stub(currentBundle, { currentBundleSha: async () => "sha" });
	stub(dbWs, {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const rows = () => [{ id: ENVIRONMENT_ID }];
			const tx = {
				insert: () => ({
					values: () =>
						Object.assign(Promise.resolve(), { returning: async () => rows() }),
				}),
				delete: () => ({ where: async () => {} }),
			};
			const saved = await run(tx);
			order.push("save");
			return saved;
		},
	});

	test("saves the environment, then starts the box again through the wake path; a refused restart does not fail the promote", async () => {
		await caller.environment.promote({
			cloudWorkspaceId: WORKSPACE_ID,
			name: "Saved",
		});
		expect(restarted).toEqual([[WORKSPACE_ID, { sessionId: "sess_A" }]]);
		expect(order).toEqual(["save", "restart"]);
	});
});
