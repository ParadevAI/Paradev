/**
 * The dispatch job: boots one real dev-project sandbox from the registry
 * image on this checkout's bundle and checks it the way a person would, then
 * stops and wakes it to check the second boot. No database: the claim is
 * built here from a throwaway identity.
 *
 *   bun run src/real-sandbox.ts            (VERCEL_SANDBOX_*, SANDBOX_GATE_SECRET, CDN_R2_*)
 *   REAL_SANDBOX_DRIVE=1 bun run src/real-sandbox.ts
 *
 * Publishes the bundle first so the box can fetch it if the image is older,
 * and its agent-tools drive, which the box mounts.
 *
 * With REAL_SANDBOX_DRIVE=1, whatever the first box's result, the same work
 * runs on a box in drive mode and on a plain box, side by side: the checkout,
 * a real `bun install`, REAL_SANDBOX_WORK_GB (default 4) GB written under
 * /workspace, persistence sentinels, a stop, a wake, a second stop. The drive
 * box also checks the layout, the stores and Docker on the drive. Then
 * it is stopped uncleanly (host-service killed, writers still going) and must
 * boot with host.db and the checkout intact, and it is promoted to a
 * drive-mode golden that a new workspace is created from on a new branch, the
 * production path. One table compares them (drive-comparison.ts). A wake
 * that is not served from a warm snapshot cache cannot be forced from here.
 *
 * REAL_SANDBOX_WAKE=prepare | cold <suffix> | delete <suffix> runs only the
 * wake measurement of wake-measure.ts instead of the checks.
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
	SANDBOX_USER,
	type SandboxIdentity,
} from "@superset/shared/sandbox/contract";
import { DEFAULT_SANDBOX_REGION } from "@superset/shared/sandbox/regions";
import { Sandbox, Snapshot } from "@vercel/sandbox";
import {
	type BoxMeasures,
	type BoxRun,
	doWork,
	readSentinels,
	renderComparison,
	SENTINELS,
	type StopMeasure,
	usableSince,
	waitForCheckout,
	writeSentinels,
} from "./drive-comparison";

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

const {
	deleteSandbox,
	deleteSandboxAndDrive,
	promoteSandboxToEnvironment,
	provisionSandbox,
	stopSandbox,
	wakeSandbox,
} = await import("@superset/trpc/lib/sandbox/vercel");
const { sandboxHostSecretFor } = await import(
	"@superset/trpc/lib/sandbox/access"
);
const { checkWakeLog, probeBox } = await import("./environments/probe");

// Only stdout is compared: sudo on the box warns on stderr that it cannot resolve the hostname.
const runOn =
	(name: string): BoxRun =>
	async (command, options = {}) => {
		const sandbox = await Sandbox.get({ ...credentials, name });
		const script = Buffer.from(command).toString("base64");
		const result = await sandbox.runCommand({
			cmd: "bash",
			args: options.root
				? ["-lc", command]
				: [
						"-c",
						`echo ${script} | base64 -d | runuser -u ${SANDBOX_USER} -- bash -l`,
					],
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

const stopMeasured = async (name: string): Promise<StopMeasure> => {
	const before = (await Sandbox.get({ ...credentials, name, resume: false }))
		.currentSnapshotId;
	const stopStarted = Date.now();
	await stopSandbox(name);
	while (Date.now() - stopStarted < 10 * 60_000) {
		const now = await Sandbox.get({ ...credentials, name, resume: false });
		if (
			now.status === "stopped" &&
			now.currentSnapshotId &&
			now.currentSnapshotId !== before
		) {
			const ms = Date.now() - stopStarted;
			const snapshot = await Snapshot.get({
				...credentials,
				snapshotId: now.currentSnapshotId,
			});
			return { ms, snapshotBytes: snapshot.sizeBytes };
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`${name} did not snapshot within 10 minutes of its stop`);
};

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
	agentTools: true,
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

const wakeMode = process.env.REAL_SANDBOX_WAKE?.trim();
if (wakeMode) {
	const wake = await import("./wake-measure");
	const driveHelpers = await import("@superset/trpc/lib/sandbox/drives");
	const wakeDrives = driveHelpers.vercelDrives();
	const deps = {
		log,
		runOn,
		stopMeasured,
		provision: (
			box: string,
			mounts: Parameters<typeof provisionFromImage>[1],
			boxClaim: typeof claim,
		) => provisionFromImage(box, mounts, boxClaim),
		wake: (args: Parameters<typeof wakeSandbox>[0]) => wakeSandbox(args),
		claimFor: (driveName: string | null, laidOut: boolean) => ({
			...claim,
			identity: {
				...identity,
				...driveHelpers.workspaceDriveIdentity(driveName, { laidOut }),
			},
		}),
		createDrive: (driveName: string) =>
			wakeDrives.create(driveName, DEFAULT_SANDBOX_REGION),
		driveNameFor: driveHelpers.workspaceDriveNameFor,
		mountsFor: driveHelpers.workspaceDriveMounts,
		deleteBox: async (box: string, driveName: string | null) => {
			await stopSandbox(box).catch(() => {});
			await deleteSandboxAndDrive(box, driveName, wakeDrives);
		},
		stoppedAt: async (box: string) => {
			const snapshotId = (
				await Sandbox.get({ ...credentials, name: box, resume: false })
			).currentSnapshotId;
			if (!snapshotId) return null;
			return (
				await Snapshot.get({ ...credentials, snapshotId })
			).createdAt.getTime();
		},
	};
	const [mode, suffix] = wakeMode.split(/\s+/);
	if (mode === "prepare") {
		process.exit(
			(await wake.prepareWakeMeasure(deps, Date.now().toString(36))) ? 1 : 0,
		);
	}
	if (mode === "cold" && suffix) {
		process.exit((await wake.coldWakeMeasure(deps, suffix)) ? 1 : 0);
	}
	if (mode === "delete" && suffix) {
		process.exit((await wake.deleteWakeMeasure(deps, suffix)) ? 1 : 0);
	}
	console.error(
		`REAL_SANDBOX_WAKE: prepare | cold <suffix> | delete <suffix>, not "${wakeMode}"`,
	);
	process.exit(64);
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
	if (!woken) throw new Error(`${name} did not wake`);
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
		goldenDriveNameFor,
		workspaceDriveNameFor,
	} = await import("@superset/trpc/lib/sandbox/drives");

	const drives = vercelDrives();
	const workGb = Number(process.env.REAL_SANDBOX_WORK_GB) || 4;
	const suffix = Date.now().toString(36);
	const goldenDrive = `env-drive-real-check-${suffix}`;
	const box = `ws-real-drive-${suffix}`;
	const plainBox = `ws-real-plain-${suffix}`;
	const goldenName = `env-real-check-${suffix}`;
	const goldenBoxDrive = goldenDriveNameFor(goldenName);
	const forkBox = `ws-real-golden-${suffix}`;
	const boxDrive = workspaceDriveNameFor(box);
	const forkDrive = workspaceDriveNameFor(forkBox);
	const mounts = workspaceDriveMounts(boxDrive);
	const claimWith = (driveName: string | null, laidOut: boolean) => ({
		...claim,
		identity: {
			...identity,
			...workspaceDriveIdentity(driveName, { laidOut }),
		},
	});
	const drive = SANDBOX_PATHS.drive;
	const expectations = [
		"sandbox.conf names the drive",
		"layout stamped",
		"host-service ready",
		"/workspace is a bind mount of the drive",
		"the checkout landed on the drive",
		"docker info reports the drive data-root",
		"the checkout is still there after a wake",
		"the layout was redone on the wake",
		"/workspace is a mount point again",
		"bun install on the plain box",
		"bun install on the drive box",
		...SENTINELS.map((name) => `plain box kept the ${name}`),
		...SENTINELS.map((name) => `drive box kept the ${name}`),
		"the drive box's root snapshot is smaller than the plain box's",
		"unclean stop: the box boots again",
		"unclean stop: host.db passes integrity_check",
		"unclean stop: the checkout is intact",
		"a workspace of a drive-mode golden boots on its new branch",
		"a workspace of a drive-mode golden has the golden's dependencies",
	];
	const reported = new Set<string>();
	let failures = 0;
	const check = (label: string, ok: boolean, detail = "") => {
		reported.add(label);
		log(
			`${ok ? "ok  " : "FAIL"} drive: ${label}${detail ? `: ${detail.replaceAll("\n", " | ")}` : ""}`,
		);
		if (!ok) failures++;
	};
	const run = runOn(box);
	const root = (command: string) => run(command, { root: true });
	const layouts = async () =>
		Number(
			(
				await root(
					`grep -c 'drive\\.layout ms=' ${SANDBOX_PATHS.bootLog} || true`,
				)
			).out,
		);
	const diagnose = async (when: string, on: BoxRun = run) => {
		const report = await on(
			[
				`echo '--- findmnt ${drive} and /workspace'`,
				`findmnt -no SOURCE,MAJ:MIN,FSROOT,OPTIONS ${drive} ${SANDBOX_PATHS.workspace}`,
				`echo '--- ls ${drive} ${drive}/workspace ${drive}/state'`,
				`ls -la ${drive} ${drive}/workspace ${drive}/state 2>&1 | head -60`,
				`echo '--- ${SANDBOX_PATHS.conf} drive keys'`,
				`grep SUPERSET_SANDBOX_DRIVE ${SANDBOX_PATHS.conf}`,
				`echo '--- run dir'`,
				`ls ${SANDBOX_PATHS.run}`,
				`echo '--- /etc/docker/daemon.json'`,
				`cat /etc/docker/daemon.json`,
				`echo '--- df ${drive}'`,
				`df -h ${drive} ${SANDBOX_PATHS.workspace} 2>&1`,
				`echo '--- git status of /workspace'`,
				`runuser -u ${SANDBOX_USER} -- git -C ${SANDBOX_PATHS.workspace} status --short --branch 2>&1 | head -20`,
				`echo '--- checkout.log'`,
				`tail -30 ${SANDBOX_PATHS.logs}/checkout.log`,
				`echo '--- boot log'`,
				`cat ${SANDBOX_PATHS.bootLog}`,
			].join("; "),
			{ root: true },
		).catch((error) => ({ detail: `diagnosis failed: ${error}` }));
		log(`drive: diagnosis ${when}:\n${report.detail}`);
	};

	const measures: Record<"plain" | "drive" | "golden", BoxMeasures> = {
		plain: {},
		drive: {},
		golden: {},
	};
	const token = randomUUID().replaceAll("-", "");

	/** Create, work, stop, wake, read the sentinels back, stop again. */
	const measureBox = async (args: {
		name: string;
		label: "plain" | "drive";
		provisionClaim: typeof claim;
		wakeClaim: typeof claim;
		mounts?: typeof mounts;
		afterFirstBoot?: () => Promise<void>;
		beforeStop?: () => Promise<void>;
		afterWake?: () => Promise<void>;
	}) => {
		const m = measures[args.label];
		const boxRun = runOn(args.name);
		const createStarted = Date.now();
		await provisionFromImage(args.name, args.mounts, args.provisionClaim);
		await wakeSandbox({
			providerSandboxId: args.name,
			claim: args.provisionClaim,
			mounts: args.mounts,
		});
		m.createToReadyMs = Date.now() - createStarted;
		if (!(await waitForCheckout(boxRun))) {
			throw new Error(`${args.name}: the checkout never became ready`);
		}
		await args.afterFirstBoot?.();
		const work = await doWork(boxRun, workGb);
		m.installMs = work.installMs;
		m.writeMs = work.writeMs;
		check(
			`bun install on the ${args.label} box`,
			work.installed === "installed",
			work.installed,
		);
		const values = await writeSentinels(boxRun, token);
		await args.beforeStop?.();
		m.firstStop = await stopMeasured(args.name);
		log(`drive: ${args.label} box stopped once`);
		const phases: Partial<Record<string, number>> = {};
		const wakeStarted = Date.now();
		await wakeSandbox({
			providerSandboxId: args.name,
			claim: args.wakeClaim,
			mounts: args.mounts,
			onPhase: (phase, ms) => {
				phases[phase] = (phases[phase] ?? 0) + ms;
			},
		});
		m.wake = {
			detachMs: phases.detach,
			mountMs: phases.mount,
			resumeMs: phases.resume,
			bootMs: phases.boot,
			totalMs: Date.now() - wakeStarted,
		};
		m.usableMs = await usableSince(boxRun, wakeStarted);
		m.sentinels = await readSentinels(boxRun, values);
		for (const name of SENTINELS) {
			check(`${args.label} box kept the ${name}`, m.sentinels[name] === true);
		}
		await args.afterWake?.();
		m.secondStop = await stopMeasured(args.name);
		log(`drive: ${args.label} box stopped twice`);
	};

	const stoppedAt: string[] = [];
	const plain = measureBox({
		name: plainBox,
		label: "plain",
		provisionClaim: claim,
		wakeClaim: claim,
	}).catch((error) => {
		stoppedAt.push(`plain box: ${String(error).slice(0, 300)}`);
	});
	const driveBox = (async () => {
		const forkStarted = Date.now();
		await drives.create(goldenDrive, DEFAULT_SANDBOX_REGION);
		await forkWorkspaceDrive({
			name: boxDrive,
			region: DEFAULT_SANDBOX_REGION,
			goldenDriveName: goldenDrive,
			drives,
		});
		measures.drive.forkMs = Date.now() - forkStarted;
		log(`drive: ${boxDrive} forked from ${goldenDrive}; provisioning ${box}`);
		let before = 0;
		await measureBox({
			name: box,
			label: "drive",
			provisionClaim: claimWith(boxDrive, false),
			wakeClaim: claimWith(boxDrive, true),
			mounts,
			afterFirstBoot: async () => {
				const conf = await root(
					`grep -c "^SUPERSET_SANDBOX_DRIVE='${boxDrive}'$" ${SANDBOX_PATHS.conf}`,
				);
				check("sandbox.conf names the drive", conf.out === "1", conf.detail);
				const bootLog = (await root(`cat ${SANDBOX_PATHS.bootLog}`)).out;
				check(
					"layout stamped",
					/drive\.layout ms=\d+/.test(bootLog),
					bootLog.match(/drive\.(layout|missing|foreign|unlaid).*/)?.[0],
				);
				check("host-service ready", /host\.ready/.test(bootLog));
				// A bind mount of a subdirectory: the drive's device, at fsroot /workspace.
				const backing = await root(
					`findmnt -rno MAJ:MIN ${drive}; findmnt -rno MAJ:MIN,FSROOT ${SANDBOX_PATHS.workspace}`,
				);
				const [device, workspaceMount] = backing.out.split("\n");
				check(
					"/workspace is a bind mount of the drive",
					Boolean(device) && workspaceMount === `${device} /workspace`,
					backing.detail,
				);
				const checkout = await root(
					`test -d ${drive}/workspace/.git && echo on-drive`,
				);
				check(
					"the checkout landed on the drive",
					checkout.out === "on-drive",
					checkout.detail,
				);
				const dockerRoot = await root(
					`(dockerd > /tmp/dockerd.log 2>&1 &); for i in $(seq 1 60); do docker info --format '{{.DockerRootDir}}' 2>/dev/null && exit 0; sleep 1; done; tail -5 /tmp/dockerd.log`,
				);
				check(
					"docker info reports the drive data-root",
					dockerRoot.out === `${drive}/docker`,
					dockerRoot.detail,
				);
				if (failures) await diagnose("after the first boot");
			},
			beforeStop: async () => {
				before = await layouts();
			},
			afterWake: async () => {
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
				const mounted = await root(
					`mountpoint ${SANDBOX_PATHS.workspace} && echo yes`,
				);
				check(
					"/workspace is a mount point again",
					mounted.out.endsWith("yes"),
					mounted.detail,
				);
			},
		});
	})().catch((error) => {
		stoppedAt.push(`drive box: ${String(error).slice(0, 300)}`);
		return "failed" as const;
	});
	const [, driveOutcome] = await Promise.all([plain, driveBox]);

	if (driveOutcome !== "failed") {
		// An unclean stop: host-service killed, writers into host.db and /workspace still going.
		try {
			await wakeSandbox({
				providerSandboxId: box,
				claim: claimWith(boxDrive, true),
				mounts,
			});
			const writer = Buffer.from(
				[
					'const { Database } = require("bun:sqlite");',
					'process.on("SIGTERM", () => {});',
					"const db = new Database(process.argv[2]);",
					'db.exec("pragma journal_mode=wal; create table if not exists superset_probe (i integer, at integer)");',
					'for (let i = 0; ; i++) db.run("insert into superset_probe values (?, ?)", [i, Date.now()]);',
				].join("\n"),
			).toString("base64");
			await run(
				`echo ${writer} | base64 -d > /tmp/superset-probe-writer.js && (setsid nohup bun /tmp/superset-probe-writer.js ${SANDBOX_PATHS.driveState}/host.db > /tmp/superset-probe-writer.log 2>&1 &) && (setsid nohup bash -c "trap '' TERM; while true; do head -c 1048576 /dev/urandom >> ${SANDBOX_PATHS.workspace}/.superset-unclean; done" > /dev/null 2>&1 &)`,
			);
			await root("sleep 3; pkill -9 -f host-service.js; true");
			await stopMeasured(box);
			await wakeSandbox({
				providerSandboxId: box,
				claim: claimWith(boxDrive, true),
				mounts,
			});
			check("unclean stop: the box boots again", true);
			const integrity = await run(
				`bun -e 'const { Database } = require("bun:sqlite"); console.log(Object.values(new Database(process.argv[1], { readonly: true }).query("pragma integrity_check").get() ?? {})[0])' ${SANDBOX_PATHS.driveState}/host.db`,
			);
			check(
				"unclean stop: host.db passes integrity_check",
				integrity.out === "ok",
				integrity.detail,
			);
			const checkout = await run(
				`git -C ${SANDBOX_PATHS.workspace} fsck --connectivity-only --no-progress > /dev/null && git -C ${SANDBOX_PATHS.workspace} status --porcelain > /dev/null && echo intact`,
			);
			check(
				"unclean stop: the checkout is intact",
				checkout.out === "intact",
				checkout.detail,
			);
		} catch (error) {
			stoppedAt.push(`unclean stop: ${String(error).slice(0, 300)}`);
		}

		// The production path: promote the drive box to a drive-mode golden, then a workspace of it.
		try {
			const golden = await promoteSandboxToEnvironment({
				sourceSandbox: box,
				goldenName,
				organizationId: identity.SUPERSET_SANDBOX_ORGANIZATION_ID,
				sourceDriveName: boxDrive,
				drives,
			});
			await stopSandbox(box);
			const forkWorkspaceId = randomUUID();
			const forkBranch = `superset/real-check-golden-${forkWorkspaceId.slice(0, 8)}`;
			const forkClaim = {
				...claim,
				hostSecret: await sandboxHostSecretFor(forkWorkspaceId),
				identity: {
					...identity,
					SUPERSET_SANDBOX_WORKSPACE_ID: forkWorkspaceId,
					SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
						{
							url: "https://github.com/paradevai/paradev.git",
							branch: forkBranch,
							baseBranch: "main",
							path: ".",
						},
					]),
					SUPERSET_SANDBOX_IMAGE_TAG: goldenName,
					...workspaceDriveIdentity(forkDrive, { laidOut: false }),
				},
			};
			const forkMounts = workspaceDriveMounts(forkDrive);
			const createStarted = Date.now();
			await forkWorkspaceDrive({
				name: forkDrive,
				region: golden.region,
				goldenDriveName: golden.goldenDriveName,
				drives,
			});
			measures.golden.forkMs = Date.now() - createStarted;
			await provisionSandbox({
				name: forkBox,
				environment: {
					sourceKind: "fork",
					sourceRef: goldenName,
					region: golden.region,
				},
				claim: forkClaim,
				mounts: forkMounts,
			});
			await wakeSandbox({
				providerSandboxId: forkBox,
				claim: forkClaim,
				mounts: forkMounts,
			});
			measures.golden.createToReadyMs = Date.now() - createStarted;
			const forkRun = runOn(forkBox);
			measures.golden.usableMs = await usableSince(forkRun, createStarted);
			await waitForCheckout(forkRun);
			const branch = await forkRun(
				`git -C ${SANDBOX_PATHS.workspace} rev-parse --abbrev-ref HEAD`,
			);
			check(
				"a workspace of a drive-mode golden boots on its new branch",
				branch.out === forkBranch,
				branch.detail,
			);
			const deps = await forkRun(
				`test -d ${SANDBOX_PATHS.workspace}/node_modules && echo present`,
			);
			check(
				"a workspace of a drive-mode golden has the golden's dependencies",
				deps.out === "present",
				deps.detail,
			);
			if (deps.out !== "present") {
				await diagnose("of the workspace of the drive-mode golden", forkRun);
			}
		} catch (error) {
			stoppedAt.push(`golden path: ${String(error).slice(0, 300)}`);
		}
	}
	const plainSnapshot = measures.plain.firstStop?.snapshotBytes;
	const driveSnapshot = measures.drive.firstStop?.snapshotBytes;
	if (plainSnapshot !== undefined && driveSnapshot !== undefined) {
		check(
			"the drive box's root snapshot is smaller than the plain box's",
			driveSnapshot < plainSnapshot,
			`${(driveSnapshot / 1024 ** 3).toFixed(2)} GB against ${(plainSnapshot / 1024 ** 3).toFixed(2)} GB`,
		);
	}
	for (const label of expectations) {
		if (!reported.has(label)) {
			check(
				label,
				false,
				`not reached${stoppedAt.length ? `: ${stoppedAt.join("; ")}` : ""}`,
			);
		}
	}
	if (failures) await diagnose("at the end");
	log(
		`drive: comparison, ${workGb} GB written under /workspace\n${renderComparison(
			[
				{ label: "plain", measures: measures.plain },
				{ label: "drive", measures: measures.drive },
				{ label: "workspace of a drive golden", measures: measures.golden },
			],
		)}`,
	);

	const cleanups: Array<[string, () => Promise<unknown>]> = keep
		? [
				[plainBox, () => stopSandbox(plainBox)],
				[box, () => stopSandbox(box)],
				[forkBox, () => stopSandbox(forkBox)],
				[goldenName, () => stopSandbox(goldenName)],
			]
		: [
				[
					plainBox,
					() => stopSandbox(plainBox).then(() => deleteSandbox(plainBox)),
				],
				[
					`${box} and ${boxDrive}`,
					() => deleteSandboxAndDrive(box, boxDrive, drives),
				],
				[
					`${forkBox} and ${forkDrive}`,
					() => deleteSandboxAndDrive(forkBox, forkDrive, drives),
				],
				[
					`${goldenName} and ${goldenBoxDrive}`,
					() => deleteSandboxAndDrive(goldenName, goldenBoxDrive, drives),
				],
			];
	for (const [what, cleanup] of cleanups) {
		await cleanup()
			.then(() =>
				log(
					`drive: ${what} ${keep ? "stopped and kept (REAL_SANDBOX_KEEP=1)" : "deleted"}`,
				),
			)
			.catch((error) => {
				failures++;
				log(`FAIL drive: could not clean up ${what}: ${error}`);
			});
	}
	await waitForDriveDetached(goldenDrive, { drives })
		.then(() => drives.remove(goldenDrive))
		.then(() => log(`drive: ${goldenDrive} deleted`))
		.catch((error) => {
			failures++;
			log(`FAIL drive: could not delete ${goldenDrive}: ${error}`);
		});
	return failures;
}
