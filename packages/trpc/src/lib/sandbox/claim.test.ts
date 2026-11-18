import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as environments from "../../router/environment/resolve-environment";
import * as plan from "../billing/plan";
import * as featureFlags from "../feature-flags";
import * as access from "./access";
import { buildSandboxClaim } from "./claim";
import * as credentials from "./credentials";
import * as drives from "./drives";
import * as plugins from "./plugins";
import * as repositories from "./repositories";

let goldenDriveName: string | null = null;
let drivesOn = true;

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
stub(featureFlags, {
	organizationFlagEnabled: async () => false,
	boxLogsEnabled: async () => false,
});
stub(credentials, {
	deriveSandboxCredentials: async () => ({
		networkPolicy: "allow-all",
		managedEnv: {},
		files: [],
	}),
});
stub(plan, { resolveMachineSize: async () => ({ vcpus: 4 }) });
stub(drives, { workspaceDrivesEnabled: async () => drivesOn });

const row = (driveName: string | null, driveLaidOutAt: Date | null = null) =>
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
		driveLaidOutAt,
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

	test("a wake expects the drive laid out only once the row recorded a boot that laid it out", async () => {
		goldenDriveName = null;
		const laidOut = await buildSandboxClaim({
			row: row("drive-ws-1", new Date()),
		});
		expect(laidOut.claim.identity.SUPERSET_SANDBOX_DRIVE).toBe("drive-ws-1");
		expect(laidOut.claim.identity.SUPERSET_SANDBOX_DRIVE_LAID_OUT).toBe("1");
		const never = await buildSandboxClaim({ row: row("drive-ws-1") });
		expect(never.claim.identity.SUPERSET_SANDBOX_DRIVE).toBe("drive-ws-1");
		expect(
			never.claim.identity.SUPERSET_SANDBOX_DRIVE_LAID_OUT,
		).toBeUndefined();
	});

	test("with the organization's flag off a new workspace gets no drive; one that has a drive keeps it", async () => {
		goldenDriveName = "env-drive-env-golden";
		drivesOn = false;
		const fresh = await buildSandboxClaim({
			row: row(null),
			provisioning: true,
		});
		expect(fresh.driveName).toBeNull();
		expect(fresh.claim.identity.SUPERSET_SANDBOX_DRIVE).toBeUndefined();
		const unarchived = await buildSandboxClaim({
			row: row("drive-ws-1"),
			provisioning: true,
		});
		expect(unarchived.driveName).toBe("drive-ws-1");
		drivesOn = true;
	});
});
