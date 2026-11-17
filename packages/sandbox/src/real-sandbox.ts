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
 *
 * With REAL_SANDBOX_DRIVE=1, a second box runs in drive mode, whatever the
 * first box's result: a throwaway golden drive, the box on a fork of it, the
 * layout, the stores, swap and Docker on the drive, then a stop and a wake.
 *
 * Every box and drive it made is deleted at the end, pass or fail: the box
 * stopped first, each drive once detached. REAL_SANDBOX_KEEP=1 keeps the
 * boxes (stopped) and the box drive for inspection instead. Exits 1 when
 * any check fails.
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
const keep = process.env.REAL_SANDBOX_KEEP === "1";
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
if (keep) {
	await stopSandbox(name)
		.then(() => log(`${name} stopped and kept (REAL_SANDBOX_KEEP=1)`))
		.catch((error) => log(`could not stop ${name}: ${error}`));
} else {
	await stopSandbox(name)
		.then(() => deleteSandbox(name))
		.then(() => log(`${name} deleted`))
		.catch((error) => log(`could not delete ${name}: ${error}`));
}

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
		identity: {
			...identity,
			...workspaceDriveIdentity(boxDrive, { laidOut: false }),
		},
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
			`${ok ? "ok  " : "FAIL"} drive: ${label}${detail ? `: ${detail.replaceAll("\n", " | ")}` : ""}`,
		);
		if (!ok) failures++;
	};
	// Only stdout is compared: sudo on the box warns on stderr that it cannot resolve the hostname.
	const run = async (command: string) => {
		const sandbox = await Sandbox.get({ ...credentials, name: box });
		const result = await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", command],
			sudo: true,
		});
		const out = (await result.stdout()).trim();
		const err = (await result.stderr()).trim();
		return {
			out,
			detail: [out, err && `stderr: ${err}`, `exit=${result.exitCode}`]
				.filter(Boolean)
				.join("\n"),
		};
	};
	const layouts = async () =>
		Number(
			(
				await run(
					`grep -c 'drive\\.layout ms=' ${SANDBOX_PATHS.bootLog} || true`,
				)
			).out,
		);
	const diagnose = async (when: string) => {
		const report = await run(
			[
				`echo '--- findmnt ${drive} and /workspace'`,
				`findmnt -no SOURCE,MAJ:MIN,FSROOT,OPTIONS ${drive} ${SANDBOX_PATHS.workspace}`,
				`echo '--- ls ${drive} ${drive}/workspace'`,
				`ls -la ${drive} ${drive}/workspace 2>&1 | head -40`,
				`echo '--- ${SANDBOX_PATHS.conf} drive key'`,
				`grep SUPERSET_SANDBOX_DRIVE ${SANDBOX_PATHS.conf}`,
				`echo '--- run dir'`,
				`ls ${SANDBOX_PATHS.run}`,
				`echo '--- /etc/docker/daemon.json'`,
				`cat /etc/docker/daemon.json`,
				`echo '--- checkout.log'`,
				`tail -30 ${SANDBOX_PATHS.logs}/checkout.log`,
				`echo '--- boot log'`,
				`cat ${SANDBOX_PATHS.bootLog}`,
			].join("; "),
		).catch((error) => ({ detail: `diagnosis failed: ${error}` }));
		log(`drive: diagnosis ${when}:\n${report.detail}`);
	};
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

		const conf = await run(
			`grep -c "^SUPERSET_SANDBOX_DRIVE='${boxDrive}'$" ${SANDBOX_PATHS.conf}`,
		);
		check("sandbox.conf names the drive", conf.out === "1", conf.detail);
		const bootLog = (await run(`cat ${SANDBOX_PATHS.bootLog}`)).out;
		check(
			"layout stamped",
			/drive\.layout ms=\d+/.test(bootLog),
			bootLog.match(/drive\.(layout|missing).*/)?.[0],
		);
		check("host-service ready", /host\.ready/.test(bootLog));
		// A bind mount of a subdirectory: the drive's device, at fsroot /workspace.
		const backing = await run(
			`findmnt -rno MAJ:MIN ${drive}; findmnt -rno MAJ:MIN,FSROOT ${SANDBOX_PATHS.workspace}`,
		);
		const [device, workspaceMount] = backing.out.split("\n");
		check(
			"/workspace is a bind mount of the drive",
			Boolean(device) && workspaceMount === `${device} /workspace`,
			backing.detail,
		);
		const checkout = await run(
			`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && break; sleep 1; done; test -d ${drive}/workspace/.git && echo on-drive`,
		);
		check(
			"the checkout landed on the drive",
			checkout.out === "on-drive",
			checkout.detail,
		);
		const swap = await run(
			`grep -o 'swap_dir=[^ ]*' ${SANDBOX_PATHS.logs}/memguard.log`,
		);
		check(
			"memguard swaps on the drive",
			swap.out.includes(`swap_dir=${drive}/swap`),
			swap.detail,
		);
		const dockerRoot = await run(
			`(dockerd > /tmp/dockerd.log 2>&1 &); for i in $(seq 1 60); do docker info --format '{{.DockerRootDir}}' 2>/dev/null && exit 0; sleep 1; done; tail -5 /tmp/dockerd.log`,
		);
		check(
			"docker info reports the drive data-root",
			dockerRoot.out === `${drive}/docker`,
			dockerRoot.detail,
		);
		if (failures) await diagnose("after the first boot");

		const before = await layouts();
		await stopSandbox(box);
		const wakeStarted = Date.now();
		await wakeSandbox({ providerSandboxId: box, claim: driveClaim, mounts });
		log(`drive: woken again in ${Date.now() - wakeStarted} ms`);
		const kept = await run(
			`git -C ${SANDBOX_PATHS.workspace} rev-parse --is-inside-work-tree`,
		);
		check(
			"the checkout is still there after a wake",
			kept.out === "true",
			kept.detail,
		);
		const after = await layouts();
		check(
			"the layout was redone on the wake",
			after > before,
			`${before} layout stamps before the wake, ${after} after`,
		);
		const mounted = await run(
			`mountpoint ${SANDBOX_PATHS.workspace} && echo yes`,
		);
		check(
			"/workspace is a mount point again",
			mounted.out.endsWith("yes"),
			mounted.detail,
		);
	} catch (error) {
		stoppedAt = String(error).slice(0, 300);
	} finally {
		for (const label of expectations) {
			if (!reported.has(label)) {
				check(label, false, `not reached${stoppedAt ? `: ${stoppedAt}` : ""}`);
			}
		}
		if (failures) await diagnose("at the end");
		if (keep) {
			await stopSandbox(box)
				.then(() => waitForDriveDetached(boxDrive, { drives }))
				.then(() =>
					log(
						`drive: ${box} stopped and kept with ${boxDrive} (REAL_SANDBOX_KEEP=1); delete both when done`,
					),
				)
				.catch((error) => log(`drive: could not stop ${box}: ${error}`));
		} else {
			await deleteSandboxAndDrive(box, boxDrive, drives)
				.then(() => log(`drive: ${box} and ${boxDrive} deleted`))
				.catch((error) => {
					failures++;
					log(`FAIL drive: could not delete ${box} and ${boxDrive}: ${error}`);
				});
		}
		await waitForDriveDetached(goldenDrive, { drives })
			.then(() => drives.remove(goldenDrive))
			.then(() => log(`drive: ${goldenDrive} deleted`))
			.catch((error) => {
				failures++;
				log(`FAIL drive: could not delete ${goldenDrive}: ${error}`);
			});
	}
	return failures;
}
