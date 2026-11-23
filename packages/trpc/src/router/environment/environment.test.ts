import { beforeEach, describe, expect, test } from "bun:test";
import { db, dbWs } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as plan from "../../lib/billing/plan";
import * as guards from "../../lib/cloud-guards";
import * as sandbox from "../../lib/sandbox";
import * as environmentBuild from "../../lib/sandbox/environment-build";
import { userError } from "../../trpc";
import * as access from "../cloud-workspace/access";
import * as wake from "../cloud-workspace/wake";
import * as integration from "../integration/utils";
import * as currentBundle from "./current-bundle";
import * as limit from "./limit";

const ENVIRONMENT_ID = "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c";
const ORGANIZATION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const WORKSPACE_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const REPOSITORY_ID = "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";
const OTHER_REPOSITORY_ID = "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f8a";

let environment: Record<string, unknown> = {};
let isAdmin = false;
let written: Record<string, unknown>[] = [];
let runningBuilds: Record<string, unknown>[] = [];
let configMatches = true;
let reapplied: unknown[] = [];

stub(db.query.environments, { findFirst: async () => environment });
stub(db.query.environmentBuilds, {
	findMany: async () => runningBuilds,
	findFirst: async () => undefined,
});
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => {
			written.push(values);
			return {
				where: () => ({
					returning: async () =>
						configMatches ? [{ ...environment, ...values }] : [],
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
	environmentRepositoryRows: async () => [{ id: REPOSITORY_ID }] as never,
	queueRulesReapply: async (scope: unknown) => {
		reapplied.push(scope);
	},
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
		primaryRepositoryId: REPOSITORY_ID,
		config: null,
	};
	isAdmin = false;
	written = [];
	runningBuilds = [];
	configMatches = true;
	reapplied = [];
	deletedBoxes = [];
});

describe("environment.archive", () => {
	test("only sets a status: the cleanup job deletes its golden (rule 3)", async () => {
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

describe("environment.update config", () => {
	const SETUP = '[setup]\nrun = "cp .env.example .env"\n';

	test("a member who neither created nor administers a shared environment cannot change its config", async () => {
		await expect(
			caller.environment.update({ id: ENVIRONMENT_ID, config: SETUP }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(written).toEqual([]);
	});

	test("a config with only comments is stored as no config, so the repository's file still applies", async () => {
		environment.createdByUserId = "user-1";
		await caller.environment.update({
			id: ENVIRONMENT_ID,
			config: "# nothing yet\n",
		});
		expect(written).toEqual([{ config: null }]);
	});

	test("a changed config is handed to the environment's running boxes; an unchanged one is not", async () => {
		environment.createdByUserId = "user-1";
		environment.config = SETUP;
		await caller.environment.update({ id: ENVIRONMENT_ID, config: SETUP });
		expect(reapplied).toEqual([]);
		await caller.environment.update({ id: ENVIRONMENT_ID, config: null });
		expect(reapplied).toEqual([{ environmentId: ENVIRONMENT_ID }]);
	});

	test("a save over a config someone else changed since the edit began is refused", async () => {
		environment.createdByUserId = "user-1";
		configMatches = false;
		await expect(
			caller.environment.update({
				id: ENVIRONMENT_ID,
				config: SETUP,
				expectedConfig: null,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(reapplied).toEqual([]);
	});
});

describe("environment.update scope", () => {
	test("a member who neither created nor administers a shared environment cannot take it private", async () => {
		environment.createdByUserId = null;
		await expect(
			caller.environment.update({ id: ENVIRONMENT_ID, scope: "personal" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(written).toEqual([]);
	});
});

describe("environment.restore", () => {
	const restore = () =>
		caller.environment.restore({
			environmentId: ENVIRONMENT_ID,
			buildId: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b",
		});

	test("a member who neither created nor administers a shared environment cannot restore it", async () => {
		await expect(restore()).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("refuses while a build is running, so the build is not failed by the swap", async () => {
		isAdmin = true;
		runningBuilds = [{ status: "running", startedAt: new Date() }];
		await expect(restore()).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

describe("environment.update repositories", () => {
	test("refuses a different set or primary; the same set goes through", async () => {
		environment.createdByUserId = "user-1";
		await expect(
			caller.environment.update({
				id: ENVIRONMENT_ID,
				repositoryIds: [REPOSITORY_ID, OTHER_REPOSITORY_ID],
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			caller.environment.update({
				id: ENVIRONMENT_ID,
				primaryRepositoryId: OTHER_REPOSITORY_ID,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await caller.environment.update({
			id: ENVIRONMENT_ID,
			repositoryIds: [REPOSITORY_ID],
			primaryRepositoryId: REPOSITORY_ID,
			name: "renamed",
		});
		expect(written).toEqual([{ name: "renamed" }]);
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
	const inserted: unknown[] = [];
	const deleted: string[] = [];
	const pruned: string[] = [];
	let selected: unknown[][] = [];
	const query = (rows: unknown[]) => {
		type Query = Promise<unknown[]> & {
			from: () => Query;
			where: () => Query;
			limit: () => Query;
		};
		const chain: Query = Object.assign(Promise.resolve(rows), {
			from: () => chain,
			where: () => chain,
			limit: () => chain,
		});
		return chain;
	};
	stub(sandbox, {
		promoteSandboxToEnvironment: async () => ({
			goldenName: "env-new",
			region: "iad1",
			stopped: { sessionId: "sess_A" },
		}),
		deleteSandbox: async (name: string) => {
			deleted.push(name);
		},
	});
	stub(environmentBuild, {
		pruneGoldens: async (row: { id: string }) => {
			pruned.push(row.id);
		},
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
				select: () => query(selected.shift() ?? []),
				update: () => ({
					set: (values: Record<string, unknown>) => ({
						where: () => ({
							returning: async () => [{ ...environment, ...values }],
						}),
					}),
				}),
				insert: () => ({
					values: (values: unknown) => {
						inserted.push(values);
						return Object.assign(Promise.resolve(), {
							returning: async () => rows(),
						});
					},
				}),
				delete: () => ({ where: async () => {} }),
			};
			const saved = await run(tx);
			order.push("save");
			return saved;
		},
	});

	test("saves the environment, then starts the box again through the wake path; a refused restart does not fail the promote", async () => {
		environment.config = '[setup]\nrun = "cp .env.example .env"\n';
		await caller.environment.promote({
			cloudWorkspaceId: WORKSPACE_ID,
			name: "Saved",
		});
		expect(restarted).toEqual([[WORKSPACE_ID, { sessionId: "sess_A" }]]);
		expect(order).toEqual(["save", "restart"]);
		expect(inserted).toContainEqual(
			expect.objectContaining({
				name: "Saved",
				config: environment.config,
				machineSize: "large",
			}),
		);
		expect(inserted).toContainEqual(
			expect.objectContaining({
				trigger: "promote",
				status: "succeeded",
				goldenRef: expect.stringMatching(/^env-/),
			}),
		);
	});

	test("a checkpoint keeps the snapshot it replaces in history, with that snapshot's repositories, and leaves deleting to retention", async () => {
		environment.createdByUserId = "user-1";
		environment.sourceKind = "fork";
		environment.sourceRef = "env-old";
		selected = [
			[
				{
					sourceKind: "fork",
					sourceRef: "env-old",
					primaryRepositoryId: OTHER_REPOSITORY_ID,
				},
			],
			[{ repositoryId: OTHER_REPOSITORY_ID }],
			[],
		];
		inserted.length = 0;
		await caller.environment.promote({
			cloudWorkspaceId: WORKSPACE_ID,
			environmentId: ENVIRONMENT_ID,
		});
		expect(inserted).toContainEqual(
			expect.objectContaining({
				goldenRef: "env-old",
				trigger: "promote",
				repositoryIds: [OTHER_REPOSITORY_ID],
				primaryRepositoryId: OTHER_REPOSITORY_ID,
			}),
		);
		expect(deleted).toEqual([]);
		expect(pruned).toEqual([ENVIRONMENT_ID]);
	});
});
