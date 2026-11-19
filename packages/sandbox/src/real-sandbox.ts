/**
 * The dispatch job: boots one real dev-project sandbox from the registry
 * image on this checkout's bundle and checks it the way a person would, then
 * stops and wakes it to check the second boot. No database: the claim is
 * built here from a throwaway identity.
 *
 *   bun run src/real-sandbox.ts            (VERCEL_SANDBOX_*, SANDBOX_GATE_SECRET, CDN_R2_*)
 *
 * Publishes the bundle first so the box can fetch it if the image is older,
 * and its agent-tools drive, which the box mounts.
 * Leaves the sandbox up for inspection on failure; deletes it on success.
 */

import { randomUUID } from "node:crypto";
import { GOLDEN_BOX_VCPUS } from "@superset/shared/billing";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import {
	SANDBOX_CONTRACT_VERSION,
	type SandboxIdentity,
} from "@superset/shared/sandbox/contract";
import { DEFAULT_SANDBOX_REGION } from "@superset/shared/sandbox/regions";
import { Drive, Sandbox } from "@vercel/sandbox";

process.env.SKIP_ENV_VALIDATION ??= "1";

const started = Date.now();
const log = (line: string) =>
	console.log(
		`${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s ${line}`,
	);
const credentials = {
	token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
};
if (
	!credentials.token ||
	!credentials.teamId ||
	!credentials.projectId ||
	!process.env.SANDBOX_GATE_SECRET
) {
	console.error(
		"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID, VERCEL_SANDBOX_PROJECT_ID and SANDBOX_GATE_SECRET are required",
	);
	process.exit(64);
}

const { buildBundle, publishBundle } = await import("./build");
const bundle = buildBundle();
await publishBundle(bundle, { dry: false });
const agentTools = await import("./agent-tools");
const drives = [
	{
		region: DEFAULT_SANDBOX_REGION,
		result: await agentTools.publishAgentToolsDrive({
			host: agentTools.vercelDriveHost(credentials),
			region: DEFAULT_SANDBOX_REGION,
			bundleSha: bundle.sha256,
			assets: bundle.assets,
		}),
	},
];
for (const line of agentTools.describeAgentToolsPublish(drives, bundle.assets))
	log(line);
const gaps = agentTools.agentToolsGaps(
	drives,
	new Set([DEFAULT_SANDBOX_REGION]),
);
if (gaps.length) {
	console.error(`agent-tools: ${gaps.join("; ")}`);
	process.exit(1);
}

const { deleteSandbox, provisionSandbox, wakeSandbox } = await import(
	"@superset/trpc/lib/sandbox/vercel"
);
const { sandboxHostSecretFor } = await import(
	"@superset/trpc/lib/sandbox/access"
);
const { checkGateTerminal, checkWakeLog, insideOverlay, probeBox } =
	await import("./environments/probe");

// Spike only: the overlay root (packages/sandbox/spike-overlay), with its own drive.
const overlay = process.env.REAL_SANDBOX_OVERLAY === "1";
const name = `${overlay ? "ovl-spike-ci" : "ws-real-check"}-${Date.now().toString(36)}`;
const driveName = overlay ? `${name}-drive` : null;
if (driveName) {
	await Drive.getOrCreate({
		...credentials,
		name: driveName,
		region: DEFAULT_SANDBOX_REGION,
	});
	log(`overlay mode: drive ${driveName}`);
}
const workspaceId = randomUUID();
// Cut from main the way a real workspace is, so the probe's branch check
// covers the branching itself and not just that a checkout happened.
const workingBranch = `superset/real-check-${workspaceId.slice(0, 8)}`;
const identity: SandboxIdentity = {
	SUPERSET_SANDBOX_CONTRACT: String(SANDBOX_CONTRACT_VERSION) as "1",
	SUPERSET_BUNDLE_SHA: bundle.sha256,
	SUPERSET_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
	SUPERSET_SANDBOX_WORKSPACE_ID: workspaceId,
	SUPERSET_SANDBOX_ORGANIZATION_ID: randomUUID(),
	SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
		{
			url: "https://github.com/paradevai/paradev.git",
			branch: workingBranch,
			baseBranch: "main",
			path: ".",
		},
	]),
	SUPERSET_SANDBOX_IMAGE_TAG: SANDBOX_IMAGE_NAME,
	SUPERSET_SANDBOX_PROVIDER: "vercel",
	...(overlay ? { SUPERSET_SANDBOX_OVERLAY: "1" as const } : {}),
};
const hostSecret = await sandboxHostSecretFor(workspaceId);
const claim = {
	identity,
	hostSecret,
	managedEnv: { SUPERSET_REAL_CHECK: "1" },
	networkPolicy: "allow-all" as const,
	vcpus: GOLDEN_BOX_VCPUS,
	agentTools: true,
};

log(
	`provisioning ${name} from ${SANDBOX_IMAGE_NAME} on bundle ${bundle.sha256.slice(0, 12)}`,
);
// A freshly pushed image sits in `Preparing` while the registry optimises
// it, and create answers 409 until then.
const deadline = Date.now() + 20 * 60_000;
for (;;) {
	try {
		await provisionSandbox({
			name,
			environment: {
				sourceKind: "image",
				sourceRef: SANDBOX_IMAGE_NAME,
				region: DEFAULT_SANDBOX_REGION,
			},
			claim,
			...(driveName
				? {
						extraMounts: {
							"/mnt/superset-drive": {
								drive: driveName,
								mode: "read-write" as const,
							},
						},
					}
				: {}),
		});
		break;
	} catch (error) {
		const notReady =
			String(error).includes("409") ||
			String(error).includes("image_not_ready");
		if (!notReady || Date.now() > deadline) throw error;
		log("image still preparing in the registry, waiting");
		await new Promise((resolve) => setTimeout(resolve, 15_000));
	}
}
const woken = await wakeSandbox({ providerSandboxId: name, claim });
if (!woken) throw new Error(`${name} did not wake`);
log(
	`host-service answered at ${woken.hostTarget} (${Date.now() - started} ms since start)`,
);
let failed = await probeBox({
	name,
	credentials,
	hostSecret,
	bundleSha: bundle.sha256,
	branch: workingBranch,
	primaryPath: ".",
	gate: process.env.SANDBOX_GATE_ORIGIN
		? { workspaceId, userId: randomUUID() }
		: null,
	overlay,
	log,
});
const gateUser = { workspaceId, userId: randomUUID() };
const wokenHost = woken.hostTarget;
async function overlayChecks(label: string): Promise<number> {
	if (!overlay) return 0;
	const box = await Sandbox.get({ ...credentials, name });
	const r = await box.runCommand({
		cmd: "sudo",
		args: [
			"-n",
			...insideOverlay(
				'echo "root=$(findmnt -no FSTYPE /) host_ns=$(sudo -n readlink /proc/$(cat /run/superset/host-service.pid)/ns/mnt) pid1_ns=$(sudo -n readlink /proc/1/ns/mnt) branch=$(git -C /workspace branch --show-current) inside=$(grep -c overlay.inside /var/log/superset/boot.log)"',
			),
		],
	});
	const out = (await r.stdout()).trim();
	const m =
		/root=(\S+) host_ns=(\S+) pid1_ns=(\S+) branch=(\S*) inside=(\d+)/.exec(
			out,
		);
	const ok =
		!!m && m[1] === "overlay" && m[2] !== m[3] && m[4] === workingBranch;
	log(
		`${ok ? "ok  " : "FAIL"} ${label}: overlay root, host-service in its own namespace, branch inside: ${out}`,
	);
	let failed = ok ? 0 : 1;
	if (process.env.SANDBOX_GATE_ORIGIN) {
		failed += await checkGateTerminal({
			gate: gateUser,
			host: wokenHost,
			label,
			log,
		});
	}
	return failed;
}
failed += await overlayChecks("first boot");
{
	const box = await Sandbox.get({ ...credentials, name });
	await box.stop();
	const wakeStarted = Date.now();
	await wakeSandbox({ providerSandboxId: name, claim });
	log(`woken again in ${Date.now() - wakeStarted} ms`);
	failed += await checkWakeLog({ name, credentials, log });
	failed += await overlayChecks("after sleep and wake");
}
if (failed) {
	console.error(`${failed} check(s) failed; ${name} left for inspection`);
	process.exit(1);
}
await deleteSandbox(name);
if (driveName) {
	for (let i = 0; i < 90; i++) {
		if (
			!(await Drive.get({ ...credentials, name: driveName })).currentSandboxName
		)
			break;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	await (await Drive.get({ ...credentials, name: driveName })).delete();
	log(`${driveName} deleted`);
}
log(`${name} deleted; all checks passed`);
process.exit(0);
