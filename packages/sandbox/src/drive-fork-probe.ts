/**
 * Measures what a Vercel drive fork costs, on throwaway `spike-fork-*`
 * drives and sandboxes that it deletes: how long a fork of a realistic
 * workspace drive takes, whether the fork is independent of its parent,
 * and how cold reads from a fresh fork compare with the parent.
 *
 *   bun run src/drive-fork-probe.ts          needs VERCEL_SANDBOX_* credentials
 */
import { Drive, Sandbox } from "@vercel/sandbox";

const credentials = {
	token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
	teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
	projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
};
if (!credentials.token || credentials.token.startsWith("fake-")) {
	console.error("VERCEL_SANDBOX_TOKEN, _TEAM_ID and _PROJECT_ID are required");
	process.exit(64);
}

const REGION = "sfo1";
const MOUNT = "/mnt/drive";
const REPO = "https://github.com/ParadevAI/Paradev.git";
const run = Date.now().toString(36);
const started = Date.now();
const log = (line: string) =>
	console.log(
		`${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s ${line}`,
	);
const drives: string[] = [];
const boxes: string[] = [];

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
	const from = Date.now();
	const result = await work();
	log(`${label}: ${((Date.now() - from) / 1000).toFixed(1)} s`);
	return result;
}

async function box(name: string, drive: Drive): Promise<Sandbox> {
	boxes.push(name);
	return Sandbox.create({
		...credentials,
		name,
		region: REGION,
		persistent: false,
		resources: { vcpus: 4 },
		timeout: 20 * 60_000,
		mounts: { [MOUNT]: drive },
	});
}

async function sh(sandbox: Sandbox, script: string): Promise<string> {
	const result = await sandbox.runCommand({
		cmd: "bash",
		args: ["-c", `exec 2>&1; ${script}`],
		sudo: true,
	});
	const out = (await result.output("both")).trim();
	if (result.exitCode !== 0) log(`  exit ${result.exitCode}`);
	return out;
}

async function release(sandbox: Sandbox, drive: string): Promise<void> {
	await sandbox.stop();
	for (let i = 0; i < 120; i++) {
		const now = await Sandbox.get({
			...credentials,
			name: sandbox.name,
			resume: false,
		});
		const held = (await Drive.get({ ...credentials, name: drive }))
			.currentSandboxName;
		if (now.status === "stopped" && !held) return;
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	}
	throw new Error(`${drive} still attached after ${sandbox.name} stopped`);
}

const READ_ALL = `export HOME=/root; cd ${MOUNT}/repo && ms(){ date +%s%3N; }; s=$(ms); git status --short | wc -l; echo "git status $(( $(ms)-s )) ms"; s=$(ms); find node_modules -type f -print0 | xargs -0 -P 8 -n 500 cat > /dev/null; echo "read all of node_modules $(( $(ms)-s )) ms"`;

try {
	const baseName = `spike-fork-base-${run}`;
	drives.push(baseName);
	const base = await Drive.getOrCreate({
		...credentials,
		name: baseName,
		region: REGION,
		maxSize: 40 * 1024 ** 3,
	});

	const writer = await box(`spike-fork-writer-${run}`, base);
	log(
		await sh(
			writer,
			`chmod 777 ${MOUNT} && cd ${MOUNT} && export HOME=/root && git config --global --add safe.directory '*' && git clone -q --depth 1 ${REPO} repo && cd repo && npm i -g bun@$(cat .bun-version) >/dev/null 2>&1; BUN_INSTALL_CACHE_DIR=${MOUNT}/store bun install --ignore-scripts 2>&1 | tail -2; head -c 6G /dev/urandom > ${MOUNT}/big.bin; echo base > ${MOUNT}/marker; sync; du -sh ${MOUNT} | cut -f1; find node_modules -type f | wc -l`,
		),
	);
	await timed("writer stop and drive release", () => release(writer, baseName));

	const forkName = `spike-fork-a-${run}`;
	drives.push(forkName);
	const fork = await timed("FORK of the populated drive", () =>
		base.fork({ name: forkName }),
	);
	log(
		`fork: parentDriveId ${fork.parentDriveId === base.driveId ? "is the base" : fork.parentDriveId}, region ${fork.region}, maxSize ${fork.maxSize}`,
	);

	const secondName = `spike-fork-b-${run}`;
	drives.push(secondName);
	await timed("second FORK of the same drive", () =>
		base.fork({ name: secondName }),
	);

	const reader = await timed("sandbox create with the fork mounted", () =>
		box(`spike-fork-reader-${run}`, fork),
	);
	log(
		`fork, first read:\n${await sh(reader, `git config --global --add safe.directory '*'; ${READ_ALL}`)}`,
	);
	log(`fork, second read:\n${await sh(reader, READ_ALL)}`);
	log(
		await sh(
			reader,
			`cat ${MOUNT}/marker; echo fork > ${MOUNT}/marker; head -c 1G /dev/urandom > ${MOUNT}/only-in-fork.bin; sync; df -h ${MOUNT} | tail -1`,
		),
	);
	await timed("reader stop and fork release", () => release(reader, forkName));

	const check = await box(`spike-fork-check-${run}`, base);
	log(
		`base after the fork was written: marker=${await sh(check, `cat ${MOUNT}/marker; ls ${MOUNT} | tr '\\n' ' '`)}`,
	);
	log(
		`base, read after forks exist:\n${await sh(check, `git config --global --add safe.directory '*'; ${READ_ALL}`)}`,
	);
	await release(check, baseName);

	const grandName = `spike-fork-c-${run}`;
	drives.push(grandName);
	await timed("FORK of a fork (1 GB written since)", () =>
		fork.fork({ name: grandName }),
	);

	await timed("delete the base while forks exist", async () => {
		await base.delete();
		drives.splice(drives.indexOf(baseName), 1);
	}).catch((error) =>
		log(`delete base refused: ${String(error).slice(0, 200)}`),
	);
	const orphan = await box(
		`spike-fork-orphan-${run}`,
		await Drive.get({ ...credentials, name: secondName }),
	);
	log(
		`fork b after its parent was deleted:\n${await sh(orphan, `git config --global --add safe.directory '*'; cat ${MOUNT}/marker; ${READ_ALL}`)}`,
	);
	await release(orphan, secondName);
} catch (error) {
	log(`FAILED: ${String(error).slice(0, 400)}`);
	process.exitCode = 1;
} finally {
	for (const name of boxes) {
		const sandbox = await Sandbox.get({
			...credentials,
			name,
			resume: false,
		}).catch(() => null);
		if (!sandbox) continue;
		if (sandbox.status === "running") await sandbox.stop().catch(() => {});
		await sandbox.delete().catch(() => {});
	}
	await new Promise((resolve) => setTimeout(resolve, 15_000));
	for (const name of drives.reverse()) {
		const drive = await Drive.get({ ...credentials, name }).catch(() => null);
		await drive
			?.delete()
			.catch((error) =>
				log(`left behind: ${name}: ${String(error).slice(0, 120)}`),
			);
	}
	log("cleaned up");
}
