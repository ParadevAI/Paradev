import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as attachments from "../../lib/attachments";
import * as plan from "../../lib/billing/plan";
import * as guards from "../../lib/cloud-guards";
import * as githubUser from "../../lib/github-user";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as userSettings from "../../lib/user-settings";
import * as workspaceAccess from "../../lib/workspace-access";
import * as access from "./access";
import * as activity from "./activity";
import * as jobs from "./jobs";
import * as meter from "./meter";
import * as wake from "./wake";

const WORKSPACE_ID = "0b8f4c1e-2a3d-4e5f-8a9b-1c2d3e4f5a6b";
const ROW = {
	id: WORKSPACE_ID,
	organizationId: "org-1",
	status: "ready",
	providerSandboxId: "box-1",
	machineSize: "large",
};

let running = false;
let boxVcpus = 8;
let restartedWith: string[] = [];

const ENVIRONMENT_ID = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
let inserted: unknown[] = [];
let queuedJobs: { launch?: { surface?: string; effort?: string } }[] = [];
let environmentSize: string | null = null;
let sizeLookups: (string | null | undefined)[] = [];

stub(db.query.cloudWorkspaces, { findFirst: async () => ROW });
stub(db.query.environments, {
	findFirst: async () => ({
		id: ENVIRONMENT_ID,
		scope: "organization",
		machineSize: environmentSize,
	}),
});
stub(db.query.users, {
	findFirst: async () => ({ id: "user-1", name: "Ana", image: null }),
});
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: () => ({ returning: async () => [{ ...ROW, ...values }] }),
		}),
	}),
	insert: () => ({
		values: (values: Record<string, unknown> | unknown[]) => {
			inserted.push(values);
			return Object.assign(Promise.resolve(), {
				returning: async () => [{ ...ROW, ...values }],
			});
		},
	}),
});
stub(githubUser, { githubUserTokenFor: async () => null });
stub(attachments, { anchorAttachments: async () => {} });
stub(activity, { recordCloudWorkspaceActivity: async () => {} });
stub(workspaceAccess, { pushWorkspaceAccess: () => {} });
stub(userSettings, { acpChatEnabled: async () => true });
stub(jobs, {
	publishCloudWorkspaceJob: async (job: { body: (typeof queuedJobs)[0] }) => {
		queuedJobs.push(job.body);
	},
});
stub(guards, {
	assertMember: async () => {},
	assertCloudAccess: async () => {},
});
stub(access, { canOpenWorkspace: async () => true });
stub(plan, {
	resolveMachineSize: async (_: string, name: string | null | undefined) => {
		sizeLookups.push(name);
		return name === "xlarge"
			? { name, vcpus: 16 }
			: name == null
				? { name: "medium", vcpus: 4 }
				: null;
	},
});
stub(meter, { assertMayBoot: async () => {} });
const FORWARD = {
	port: 5173,
	localPort: 5174,
	since: 1,
	user: { id: "user-1", name: "Ana", image: null },
};
stub(realtime, {
	nudge: () => {},
	readWorkspaceForwards: async () => [FORWARD],
});
stub(sandbox, {
	describeSandbox: async () => ({
		hostTarget: "https://box-1.example",
		running,
		vcpus: boxVcpus,
	}),
	environmentRepositoryRows: async () => [
		{ id: "repo-1", defaultBranch: "main" },
	],
	primaryRepository: (rows: unknown[]) => rows[0],
	recordWorkspaceRepositories: async () => {},
	workspaceBranchName: () => "paradev/ws-1",
});
stub(wake, {
	restartCloudWorkspace: async (row: { machineSize: string }) => {
		restartedWith.push(row.machineSize);
		boxVcpus = 16;
		return {
			hostTarget: "https://box-1.example",
			agentCredentialsChanged: false,
		};
	},
});

const { cloudWorkspaceRouter } = await import("./cloud-workspace");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const caller = createCallerFactory(
	createTRPCRouter({ cloudWorkspace: cloudWorkspaceRouter }),
)(
	createTRPCContext({
		session: {
			user: { id: "user-1", email: "user@example.com" },
			session: { activeOrganizationId: "org-1" },
		} as never,
		auth: {} as never,
		headers: new Headers(),
		sandboxCaller: null,
	}),
);

beforeEach(() => {
	running = false;
	boxVcpus = 8;
	restartedWith = [];
	inserted = [];
	queuedJobs = [];
	environmentSize = null;
	sizeLookups = [];
});

describe("cloudWorkspace.create", () => {
	const create = (input: Record<string, unknown>) =>
		caller.cloudWorkspace.create({
			organizationId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
			environmentId: ENVIRONMENT_ID,
			machineSize: "xlarge",
			...input,
		} as never);

	test("files the new workspace under the caller's tags", async () => {
		const row = await create({ tags: ["Fleet", "migration"] });
		expect(inserted).toContainEqual([
			expect.objectContaining({ tag: "fleet", createdByUserId: "user-1" }),
			expect.objectContaining({ tag: "migration", createdByUserId: "user-1" }),
		]);
		expect(row.tags).toEqual(["fleet", "migration"]);
	});

	test("opens a chat that carries the agent's effort and mode to the box", async () => {
		const row = await create({
			agent: "claude",
			prompt: "Fix the build",
			effort: "high",
			mode: "plan",
		});
		expect(queuedJobs[0]?.launch).toMatchObject({
			surface: "chat",
			effort: "high",
			mode: "plan",
		});
		expect(row.initialLaunch).toMatchObject({ surface: "chat" });
	});

	test("boots at the environment's size when the create names none", async () => {
		environmentSize = "xlarge";
		const row = await create({ machineSize: undefined });
		expect(row.machineSize).toBe("xlarge");
	});

	test("falls back to the organization's default when the environment's size is no longer offered", async () => {
		environmentSize = "2xlarge";
		const row = await create({ machineSize: undefined });
		expect(sizeLookups).toEqual(["2xlarge", undefined]);
		expect(row.machineSize).toBe("medium");
	});

	test("refuses a size the caller names that the plan does not offer, whatever the environment's", async () => {
		environmentSize = "xlarge";
		await expect(create({ machineSize: "2xlarge" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});

describe("cloudWorkspace.setMachineSize", () => {
	test("restarts a running box at the new size, and leaves a stopped one for its next wake", async () => {
		const stopped = await caller.cloudWorkspace.setMachineSize({
			id: WORKSPACE_ID,
			machineSize: "xlarge",
		});
		expect(stopped).toMatchObject({ restarted: false, boxVcpus: 8 });
		expect(restartedWith).toEqual([]);

		running = true;
		const restarted = await caller.cloudWorkspace.setMachineSize({
			id: WORKSPACE_ID,
			machineSize: "xlarge",
		});
		expect(restarted).toMatchObject({
			restarted: true,
			vcpus: 16,
			boxVcpus: 16,
		});
		expect(restartedWith).toEqual(["xlarge"]);
	});

	test("refuses a size the organization does not offer", async () => {
		await expect(
			caller.cloudWorkspace.setMachineSize({
				id: WORKSPACE_ID,
				machineSize: "2xlarge",
			}),
		).rejects.toThrow('Machine size "2xlarge" is not available');
	});
});

describe("cloudWorkspace.forwards", () => {
	const boxCaller = createCallerFactory(
		createTRPCRouter({ cloudWorkspace: cloudWorkspaceRouter }),
	)(
		createTRPCContext({
			session: {
				user: { id: "user-1", email: "user@example.com" },
				session: { activeOrganizationId: "org-1" },
			} as never,
			auth: {} as never,
			headers: new Headers(),
			sandboxCaller: {
				workspaceId: WORKSPACE_ID,
				organizationId: "org-1",
				userId: "user-1",
			},
		}),
	);

	test("a box reads its own workspace's forwards", async () => {
		expect(
			await boxCaller.cloudWorkspace.forwards({ id: WORKSPACE_ID }),
		).toEqual({ forwards: [FORWARD] });
	});

	test("a box cannot read another workspace's forwards", async () => {
		expect(
			boxCaller.cloudWorkspace.forwards({
				id: "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
