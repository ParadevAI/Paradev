/**
 * Probes what a stop snapshots, on one throwaway sandbox:
 *   - does a written file grow the snapshot, and does deleting it shrink it
 *   - does a swapfile count, active or deleted
 *   - do processes get SIGTERM before the snapshot, and can they still write
 *
 *   bun run packages/sandbox/src/snapshot-probe.ts
 */
import { Sandbox, Snapshot } from "@vercel/sandbox";

const credentials = {
	token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
};
const name = `spike-snapshot-probe-${Date.now().toString(36)}`;
const started = Date.now();
const log = (line: string) =>
	console.log(
		`${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s ${line}`,
	);
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

async function sh(script: string): Promise<string> {
	const sandbox = await Sandbox.get({ ...credentials, name, resume: true });
	const result = await sandbox.runCommand({
		cmd: "bash",
		args: ["-c", script],
		sudo: true,
	});
	const out = (await result.output("both")).trim();
	if (result.exitCode !== 0)
		log(`  exit ${result.exitCode}: ${out.slice(0, 300)}`);
	return out;
}

async function stopAndMeasure(label: string): Promise<number> {
	const sandbox = await Sandbox.get({ ...credentials, name, resume: false });
	const before = sandbox.currentSnapshotId;
	const t = Date.now();
	await sandbox.stop();
	for (let i = 0; i < 240; i++) {
		const now = await Sandbox.get({ ...credentials, name, resume: false });
		if (
			now.status === "stopped" &&
			now.currentSnapshotId &&
			now.currentSnapshotId !== before
		) {
			const snapshot = await Snapshot.get({
				...credentials,
				snapshotId: now.currentSnapshotId,
			});
			log(
				`${label}: snapshot ${mb(snapshot.sizeBytes)} (stop took ${((Date.now() - t) / 1000).toFixed(0)}s)`,
			);
			return snapshot.sizeBytes;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`${label}: no new snapshot`);
}

try {
	await Sandbox.create({
		...credentials,
		name,
		resources: { vcpus: 2 },
		timeout: 20 * 60 * 1000,
		persistent: true,
		keepLastSnapshots: { count: 1 },
	});
	log(`created ${name}`);
	log(
		await sh(
			"findmnt -no SOURCE,FSTYPE,OPTIONS /; lsblk -D -o NAME,DISC-GRAN,DISC-MAX | head -4; df -h / | tail -1",
		),
	);
	const base = await stopAndMeasure("baseline");

	await sh("head -c 3G /dev/urandom > /var/big.bin; sync");
	const written = await stopAndMeasure("3 GB random file written");

	await sh("rm -f /var/big.bin; sync; fstrim -v / 2>&1 || true");
	const deleted = await stopAndMeasure("file deleted");

	log(
		await sh(
			"mkdir -p /var/swap && fallocate -l 2G /var/swap/a && chmod 600 /var/swap/a && mkswap /var/swap/a >/dev/null && swapon /var/swap/a && swapon --show",
		),
	);
	const swapOn = await stopAndMeasure("2 GB swapfile active, unused");

	// A process that reacts to SIGTERM: can a box clean up at stop?
	await sh(`rm -f /var/term.log; nohup bash -c 'trap "date +%s%3N >> /var/term.log; swapoff /var/swap/a; rm -f /var/swap/a; date +%s%3N >> /var/term.log; sync; exit 0" TERM; while true; do sleep 1; done' >/dev/null 2>&1 &
sleep 1; echo started`);
	const afterTrap = await stopAndMeasure(
		"stop with a SIGTERM trap that removes swap",
	);
	log(
		`term.log after resume: [${await sh("cat /var/term.log 2>/dev/null; ls -la /var/swap 2>/dev/null")}]`,
	);

	console.log(
		JSON.stringify({ base, written, deleted, swapOn, afterTrap }, null, 2),
	);
} finally {
	const sandbox = await Sandbox.get({
		...credentials,
		name,
		resume: false,
	}).catch(() => null);
	if (sandbox) {
		if (sandbox.status === "running") await sandbox.stop().catch(() => {});
		await sandbox
			.delete({ deleteOrphanSnapshots: true })
			.catch((error) => log(`delete failed: ${error}`));
		log(`deleted ${name}`);
	}
}
