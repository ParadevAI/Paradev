/**
 * Scratch experiment (do not merge): does a bloated snapshot make a wake
 * slow, and what shrinks it? Only touches sandboxes named wake-fix-*, which
 * it creates and deletes.
 */
import { Sandbox, Snapshot } from "@vercel/sandbox";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";

const creds = {
	token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
};
const REGION = (process.env.WAKE_FIX_REGION ?? "iad1") as "iad1";
const BLOAT_GB = Number(process.env.WAKE_FIX_BLOAT_GB ?? 30);
const started = Date.now();
const log = (line: string) =>
	console.log(`${((Date.now() - started) / 1000).toFixed(0).padStart(5)}s ${line}`);
const made = new Set<string>();
const results: string[] = [];
let activeVcpuSeconds = 0;

async function create(name: string, vcpus = 4): Promise<Sandbox> {
	made.add(name);
	return Sandbox.create({
		...creds,
		name,
		image: SANDBOX_IMAGE_NAME,
		region: REGION,
		persistent: true,
		timeout: 45 * 60_000,
		resources: { vcpus },
		snapshotExpiration: 24 * 60 * 60_000,
		keepLastSnapshots: { count: 1 },
	} as never);
}

async function sh(box: Sandbox, cmd: string): Promise<string> {
	const t = Date.now();
	const result = await box.runCommand({ cmd: "bash", args: ["-lc", cmd], sudo: true });
	const out = `${(await result.stdout()).trim()} ${(await result.stderr()).trim()}`.trim();
	activeVcpuSeconds += ((Date.now() - t) / 1000) * (box.vcpus ?? 4);
	log(`  $ ${cmd.slice(0, 90)} -> exit ${result.exitCode} in ${Date.now() - t} ms: ${out.slice(-300)}`);
	return out;
}

async function stopAndSize(name: string): Promise<number> {
	const box = await Sandbox.get({ ...creds, name, resume: false } as never);
	await box.stop();
	for (let i = 0; i < 120; i++) {
		const now = await Sandbox.get({ ...creds, name, resume: false } as never);
		if (now.status === "stopped") break;
		await new Promise((r) => setTimeout(r, 5_000));
	}
	const snaps = await (await Snapshot.list({ ...creds, name, limit: 5 } as never)).toArray();
	const newest = snaps.sort((a, b) => b.createdAt - a.createdAt)[0];
	return newest?.sizeBytes ?? -1;
}

/** Resume a stopped box and run one command; what the control plane's wake waits on first. */
async function wakeMs(name: string): Promise<{ getMs: number; firstCmdMs: number }> {
	const t0 = Date.now();
	const box = await Sandbox.get({ ...creds, name, resume: true } as never);
	const getMs = Date.now() - t0;
	await box.runCommand({ cmd: "true" });
	return { getMs, firstCmdMs: Date.now() - t0 };
}

async function measure(label: string, name: string): Promise<void> {
	const size = await stopAndSize(name);
	const w1 = await wakeMs(name);
	const size2 = await stopAndSize(name);
	const w2 = await wakeMs(name);
	const line = `RESULT ${label.padEnd(34)} snapshot ${(size / 1e9).toFixed(2)} GB / ${(size2 / 1e9).toFixed(2)} GB  wake ${w1.firstCmdMs} ms / ${w2.firstCmdMs} ms (get ${w1.getMs}/${w2.getMs})`;
	results.push(line);
	log(line);
}

const DATA = "mkdir -p /home/ubuntu/data && head -c 2G /dev/urandom > /home/ubuntu/data/blob && sync";
const ZERO_FILL = "dd if=/dev/zero of=/zero.fill bs=4M status=none oflag=direct || true; sync; rm -f /zero.fill; sync";
const TRIM = "fstrim -av || true";

try {
	log(`region ${REGION}, image ${SANDBOX_IMAGE_NAME}, bloat ${BLOAT_GB} GB`);
	const base = await create("wake-fix-base");
	await sh(base, "df -B1G --output=size,used,avail / | tail -1; nproc");
	await sh(base, DATA);
	await measure("clean (2 GB user data)", "wake-fix-base");

	const again = await Sandbox.get({ ...creds, name: "wake-fix-base", resume: true } as never);
	const free = Number((await sh(again, "df -B1G --output=avail / | tail -1")).split(/\s+/)[0]);
	const gb = Math.max(1, Math.min(BLOAT_GB, free - 3));
	await sh(again, `dd if=/dev/urandom of=/bloat bs=4M count=${gb * 256} status=none; sync; rm -f /bloat; sync; df -B1G --output=used /`);
	await measure(`bloated (+${gb} GB written, deleted)`, "wake-fix-base");

	for (const [suffix, label, cmd] of [
		["ctl", "fork, untouched", "true"],
		["a", "(a) fstrim", TRIM],
		["b", "(b) zero-fill, delete", ZERO_FILL],
		["c", "(c) zero-fill, delete, fstrim", `${ZERO_FILL}; ${TRIM}`],
	] as const) {
		const name = `wake-fix-${suffix}`;
		made.add(name);
		const fork = await Sandbox.fork({ ...creds, name, sourceSandbox: "wake-fix-base", timeout: 45 * 60_000 } as never);
		await sh(fork, cmd);
		await measure(label, name);
	}

	const fresh = await create("wake-fix-d");
	await sh(fresh, DATA);
	await measure("(d) recreated from image, data copied", "wake-fix-d");

	for (const vcpus of [2, 4, 8]) {
		const box = await Sandbox.get({ ...creds, name: "wake-fix-ctl", resume: false } as never);
		if (box.status !== "stopped") await stopAndSize("wake-fix-ctl");
		await (await Sandbox.get({ ...creds, name: "wake-fix-ctl", resume: false } as never)).update({ resources: { vcpus } } as never);
		await measure(`bloated fork at ${vcpus} vCPU`, "wake-fix-ctl");
	}
} catch (error) {
	log(`ERROR ${String(error).slice(0, 500)}`);
	process.exitCode = 1;
} finally {
	for (const name of made) {
		try {
			const snaps = await (await Snapshot.list({ ...creds, name, limit: 20 } as never)).toArray();
			const box = await Sandbox.get({ ...creds, name, resume: false } as never).catch(() => null);
			await box?.delete();
			for (const snap of snaps) {
				await (await Snapshot.get({ ...creds, snapshotId: snap.id } as never)).delete().catch(() => {});
			}
			log(`deleted ${name} and ${snaps.length} snapshot(s)`);
		} catch (error) {
			log(`could not delete ${name}: ${String(error).slice(0, 200)}`);
		}
	}
	log(`elapsed ${((Date.now() - started) / 60000).toFixed(1)} min; commands used about ${(activeVcpuSeconds / 3600).toFixed(2)} vCPU-hours`);
	for (const line of results) console.log(line);
}
