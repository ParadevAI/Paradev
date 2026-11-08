import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as plan from "../../lib/billing/plan";
import * as guards from "../../lib/cloud-guards";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as access from "./access";
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

stub(db.query.cloudWorkspaces, { findFirst: async () => ROW });
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: () => ({ returning: async () => [{ ...ROW, ...values }] }),
		}),
	}),
});
stub(guards, {
	assertMember: async () => {},
	assertCloudAccess: async () => {},
});
stub(access, { canOpenWorkspace: async () => true });
stub(plan, {
	resolveMachineSize: async (_: string, name: string) =>
		name === "xlarge" ? { name, vcpus: 16 } : null,
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
