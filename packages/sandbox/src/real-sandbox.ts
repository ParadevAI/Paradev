/**
 * The dispatch job: boots one real dev-project sandbox from the registry
 * image on this checkout's bundle and checks it the way a person would, then
 * stops and wakes it to check the second boot. No database: the claim is
 * built here from a throwaway identity.
 *
 *   bun run src/real-sandbox.ts            (VERCEL_SANDBOX_*, SANDBOX_GATE_SECRET, CDN_R2_*)
 *   REAL_SANDBOX_DRIVE=1 bun run src/real-sandbox.ts
 *
 * Publishes the bundle first so the box can fetch it if the image is older.
 * Leaves the sandbox up for inspection on failure; deletes it on success.
 *
 * With REAL_SANDBOX_DRIVE=1, a second box runs in drive mode, whatever the
 * first box's result: a throwaway golden drive, the box on a fork of it, the
 * layout, the stores, swap and Docker on the drive, then a stop and a wake.
 * The first box is then always deleted. The drive box and its drive are
 * deleted too, unless a drive expectation failed: then the box is stopped
 * and kept with its drive. Every delete stops the box first and waits for
 * the drive to detach.
 */

import { randomUUID } from "node:crypto";
import { GOLDEN_BOX_VCPUS } from "@superset/shared/billing";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import {
	SANDBOX_CONTRACT_VERSION,
	SANDBOX_PATHS,
	type SandboxIdentity,
} from "@superset/shared/sandbox/contract";
import { DEFAULT_SANDBOX_REGION } from "@superset/shared/sandbox/regions";
import { Sandbox } from "@vercel/sandbox";

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

const {
	deleteSandbox,
	deleteSandboxAndDrive,
	provisionSandbox,
	stopSandbox,
	wakeSandbox,
} = await import("@superset/trpc/lib/sandbox/vercel");
const { sandboxHostSecretFor } = await import(
	"@superset/trpc/lib/sandbox/access"
);
const { checkWakeLog, probeBox } = await import("./environments/probe");

const name = `ws-real-check-${Date.now().toString(36)}`;
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
};
const hostSecret = await sandboxHostSecretFor(workspaceId);
const claim = {
	identity,
	hostSecret,
	managedEnv: { SUPERSET_REAL_CHECK: "1" },
	networkPolicy: "allow-all" as const,
	vcpus: GOLDEN_BOX_VCPUS,
};

// A freshly pushed image sits in `Preparing` while the registry optimises
// it, and create answers 409 until then.
async function provisionFromImage(
	box: string,
	mounts?: Parameters<typeof provisionSandbox>[0]["mounts"],
	boxClaim: Parameters<typeof provisionSandbox>[0]["claim"] = claim,
): Promise<void> {
	const deadline = Date.now() + 20 * 60_000;
	for (;;) {
		try {
			await provisionSandbox({
				name: box,
				environment: {
					sourceKind: "image",
					sourceRef: SANDBOX_IMAGE_NAME,
					region: DEFAULT_SANDBOX_REGION,
				},
				claim: boxClaim,
				mounts,
			});
			return;
		} catch (error) {
			const notReady =
				String(error).includes("409") ||
				String(error).includes("image_not_ready");
			if (!notReady || Date.now() > deadline) throw error;
			log("image still preparing in the registry, waiting");
			await new Promise((resolve) => setTimeout(resolve, 15_000));
		}
	}
}

log(
	`provisioning ${name} from ${SANDBOX_IMAGE_NAME} on bundle ${bundle.sha256.slice(0, 12)}`,
);
const withDrivePass = process.env.REAL_SANDBOX_DRIVE === "1";
let failed = 0;
try {
	await provisionFromImage(name);
	const woken = await wakeSandbox({ providerSandboxId: name, claim });
	log(
		`host-service answered at ${woken.hostTarget} (${Date.now() - started} ms since start)`,
	);
	failed += await probeBox({
		name,
		credentials,
		hostSecret,
		bundleSha: bundle.sha256,
		branch: workingBranch,
		primaryPath: ".",
		gate: process.env.SANDBOX_GATE_ORIGIN
			? { workspaceId, userId: randomUUID() }
			: null,
		log,
	});
	const box = await Sandbox.get({ ...credentials, name });
	await box.stop();
	const wakeStarted = Date.now();
	await wakeSandbox({ providerSandboxId: name, claim });
	log(`woken again in ${Date.now() - wakeStarted} ms`);
	failed += await checkWakeLog({ name, credentials, log });
} catch (error) {
	console.error(
		`check of ${name} stopped early: ${String(error).slice(0, 300)}`,
	);
	failed++;
}
if (failed && !withDrivePass) {
	console.error(`${failed} check(s) failed; ${name} left for inspection`);
	process.exit(1);
}
await stopSandbox(name)
	.then(() => deleteSandbox(name))
	.then(() => log(`${name} deleted`))
	.catch((error) => log(`could not delete ${name}: ${error}`));

const driveFailures = withDrivePass ? await drivePass() : 0;
if (failed || driveFailures) {
	console.error(
		`${failed} check(s) and ${driveFailures} drive check(s) failed`,
	);
	process.exit(1);
}
log("all checks passed");
process.exit(0);

async function drivePass(): Promise<number> {
	const {
		forkWorkspaceDrive,
		vercelDrives,
		waitForDriveDetached,
		workspaceDriveIdentity,
		workspaceDriveMounts,
		workspaceDriveNameFor,
	} = await import("@superset/trpc/lib/sandbox/drives");
	const drives = vercelDrives();
	const suffix = Date.now().toString(36);
	const goldenDrive = `env-drive-real-check-${suffix}`;
	const box = `ws-real-drive-${suffix}`;
	const boxDrive = workspaceDriveNameFor(box);
	const mounts = workspaceDriveMounts(boxDrive);
	const driveClaim = {
		...claim,
		identity: { ...identity, ...workspaceDriveIdentity(boxDrive) },
	};
	const drive = SANDBOX_PATHS.drive;
	const expectations = [
		"sandbox.conf names the drive",
		"layout stamped",
		"host-service ready",
		"/workspace is a bind mount of the drive",
		"the checkout landed on the drive",
		"memguard swaps on the drive",
		"docker info reports the drive data-root",
		"the checkout is still there after a wake",
		"the layout was redone on the wake",
		"/workspace is a mount point again",
	] as const;
	const reported = new Set<string>();
	let failures = 0;
	const check = (
		label: (typeof expectations)[number],
		ok: boolean,
		detail = "",
	) => {
		reported.add(label);
		log(
			`${ok ? "ok  " : "FAIL"} drive: ${label}${detail ? `: ${detail}` : ""}`,
		);
		if (!ok) failures++;
	};
	const run = async (command: string) => {
		const sandbox = await Sandbox.get({ ...credentials, name: box });
		const result = await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", command],
			sudo: true,
		});
		return `${await result.stdout()}${await result.stderr()}`.trim();
	};
	const layouts = async () =>
		Number(
			await run(
				`grep -c 'drive\\.layout ms=' ${SANDBOX_PATHS.bootLog} || true`,
			),
		);
	let stoppedAt = "";
	try {
		await drives.create(goldenDrive, DEFAULT_SANDBOX_REGION);
		await forkWorkspaceDrive({
			name: boxDrive,
			region: DEFAULT_SANDBOX_REGION,
			goldenDriveName: goldenDrive,
			drives,
		});
		log(`drive: ${boxDrive} forked from ${goldenDrive}; provisioning ${box}`);
		await provisionFromImage(box, mounts, driveClaim);
		await wakeSandbox({ providerSandboxId: box, claim: driveClaim, mounts });

		check(
			"sandbox.conf names the drive",
			(await run(
				`grep -c "^SUPERSET_SANDBOX_DRIVE='${boxDrive}'$" ${SANDBOX_PATHS.conf}`,
			)) === "1",
		);
		const bootLog = await run(`cat ${SANDBOX_PATHS.bootLog}`);
		check(
			"layout stamped",
			/drive\.layout ms=\d+/.test(bootLog),
			bootLog.match(/drive\.(layout|missing).*/)?.[0],
		);
		check("host-service ready", /host\.ready/.test(bootLog));
		const backing = await run(
			`mountpoint -q ${SANDBOX_PATHS.workspace} && findmnt -no SOURCE ${drive} && findmnt -no SOURCE,FSROOT ${SANDBOX_PATHS.workspace}`,
		);
		const [device, workspaceMount] = backing.split("\n");
		check(
			"/workspace is a bind mount of the drive",
			Boolean(device) && workspaceMount === `${device} /workspace`,
			backing.replaceAll("\n", " | "),
		);
		const checkout = await run(
			`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && break; sleep 1; done; test -d ${drive}/workspace/.git && echo on-drive`,
		);
		check("the checkout landed on the drive", checkout.endsWith("on-drive"));
		check(
			"memguard swaps on the drive",
			(
				await run(`grep -o 'swap_dir=[^ ]*' ${SANDBOX_PATHS.logs}/memguard.log`)
			).includes(`swap_dir=${drive}/swap`),
		);
		const dockerRoot = await run(
			`(dockerd > /tmp/dockerd.log 2>&1 &); for i in $(seq 1 60); do docker info --format '{{.DockerRootDir}}' 2>/dev/null && exit 0; sleep 1; done; tail -5 /tmp/dockerd.log`,
		);
		check(
			"docker info reports the drive data-root",
			dockerRoot === `${drive}/docker`,
			dockerRoot,
		);

		const before = await layouts();
		await stopSandbox(box);
		const wakeStarted = Date.now();
		await wakeSandbox({ providerSandboxId: box, claim: driveClaim, mounts });
		log(`drive: woken again in ${Date.now() - wakeStarted} ms`);
		check(
			"the checkout is still there after a wake",
			(await run(
				`git -C ${SANDBOX_PATHS.workspace} rev-parse --is-inside-work-tree`,
			)) === "true",
		);
		check("the layout was redone on the wake", (await layouts()) > before);
		check(
			"/workspace is a mount point again",
			(await run(`mountpoint -q ${SANDBOX_PATHS.workspace} && echo yes`)) ===
				"yes",
		);
	} catch (error) {
		stoppedAt = String(error).slice(0, 300);
	} finally {
		for (const label of expectations) {
			if (!reported.has(label)) {
				check(label, false, `not reached${stoppedAt ? `: ${stoppedAt}` : ""}`);
			}
		}
		if (failures) {
			await stopSandbox(box)
				.then(() => waitForDriveDetached(boxDrive, { drives }))
				.then(() =>
					log(
						`drive: ${box} stopped and kept with ${boxDrive} for inspection; delete both when done`,
					),
				)
				.catch((error) => log(`drive: could not stop ${box}: ${error}`));
		} else {
			await deleteSandboxAndDrive(box, boxDrive, drives)
				.then(() => log(`drive: ${box} and ${boxDrive} deleted`))
				.catch((error) =>
					log(`drive: could not delete ${box} and ${boxDrive}: ${error}`),
				);
		}
		await waitForDriveDetached(goldenDrive, { drives })
			.then(() => drives.remove(goldenDrive))
			.then(() => log(`drive: ${goldenDrive} deleted`))
			.catch((error) =>
				log(`drive: could not delete ${goldenDrive}: ${error}`),
			);
	}
	return failures;
}
