import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as environments from "../../router/environment/resolve-environment";
import * as plan from "../billing/plan";
import * as access from "./access";
import * as agentTools from "./agent-tools";
import { buildSandboxClaim } from "./claim";
import * as credentials from "./credentials";
import * as plugins from "./plugins";
import * as repositories from "./repositories";

let goldenDriveName: string | null = null;

stub(environments, {
	resolveEnvironment: async () => ({
		id: "env-1",
		provider: "vercel",
		sourceKind: "fork",
		sourceRef: "env-golden",
		region: "iad1",
		bundleSha: "a".repeat(64),
		primaryRepositoryId: null,
		goldenDriveName,
		envs: {},
	}),
});
stub(repositories, {
	workspaceRepositories: async () => [],
	installationTokenFor: async () => null,
});
stub(plugins, { creatorPlugins: async () => [] });
stub(access, { sandboxHostSecretFor: async () => "secret" });
stub(agentTools, { agentToolsDriveFor: async () => null });
stub(credentials, {
	deriveSandboxCredentials: async () => ({
		networkPolicy: "allow-all",
		managedEnv: {},
		files: [],
	}),
});
stub(plan, { resolveMachineSize: async () => ({ vcpus: 4 }) });

const row = (driveName: string | null) =>
	({
		id: "00000000-0000-4000-8000-000000000001",
		organizationId: "00000000-0000-4000-8000-000000000002",
		environmentId: "00000000-0000-4000-8000-000000000003",
		createdByUserId: null,
		providerSandboxId: "ws-1",
		provider: "vercel",
		baseBranch: "main",
		branch: "superset/ws-1",
		machineSize: null,
		driveName,
	}) as unknown as Parameters<typeof buildSandboxClaim>[0]["row"];

describe("buildSandboxClaim drive", () => {
	test("an existing workspace gets no drive on a wake when its environment enters drive mode", async () => {
		goldenDriveName = "env-drive-env-golden";
		const { claim } = await buildSandboxClaim({ row: row(null) });
		expect(claim.identity.SUPERSET_SANDBOX_DRIVE).toBeUndefined();
		expect(claim.identity.SUPERSET_SANDBOX_DRIVE_LAID_OUT).toBeUndefined();
	});

	test("a provision in drive mode claims a new drive, not yet laid out", async () => {
		goldenDriveName = "env-drive-env-golden";
		const { claim } = await buildSandboxClaim({
			row: row(null),
			provisioning: true,
		});
		expect(claim.identity.SUPERSET_SANDBOX_DRIVE).toBe("drive-ws-1");
		expect(claim.identity.SUPERSET_SANDBOX_DRIVE_LAID_OUT).toBeUndefined();
	});

	test("a wake of a workspace with a drive expects it laid out", async () => {
		goldenDriveName = null;
		const { claim } = await buildSandboxClaim({ row: row("drive-ws-1") });
		expect(claim.identity.SUPERSET_SANDBOX_DRIVE).toBe("drive-ws-1");
		expect(claim.identity.SUPERSET_SANDBOX_DRIVE_LAID_OUT).toBe("1");
	});
});
