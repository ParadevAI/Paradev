/**
 * The boot-twice test: the locally built image (`bun run image --local`)
 * must boot as a box would, and a second boot must install nothing, fetch
 * nothing and skip every step. Runs the real superset-boot in a container
 * with a stub identity the way the control plane does through the sandbox
 * API (the identity written as a file, then boot as the image user through
 * sudo with the secret preserved from the command's env), then reads the
 * boot log and the step markers.
 *
 *   bun run src/boot-twice.ts            expects superset-sandbox:local
 *   SANDBOX_IMAGE=... bun run src/boot-twice.ts
 *   BOOT_TWICE_CA_FILE=/etc/ssl/certs/ca-certificates.crt bun run src/boot-twice.ts
 *       in a cloud workspace, whose egress firewall re-signs TLS: without
 *       its CA the checkout cannot reach GitHub
 *
 * Exits non-zero on any failed expectation, with the boot log printed.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	renderSandboxConf,
	SANDBOX_DRIVE_HOME_SUBTREES,
	SANDBOX_DRIVE_STORES,
	SANDBOX_PATHS,
	SANDBOX_PORTS,
	type SandboxIdentity,
} from "@superset/shared/sandbox/contract";
import { BUNDLE_SRC, PACKAGE_ROOT } from "./build";
import { discardingSteps, loadAssets, loadSteps } from "./manifest";

const IMAGE = process.env.SANDBOX_IMAGE ?? "superset-sandbox:local";
const NAME = `superset-boot-twice-${Date.now().toString(36)}`;
const DRIVE_NAME = `${NAME}-drive`;
const CA_MOUNT = process.env.BOOT_TWICE_CA_FILE
	? [
			"-v",
			`${process.env.BOOT_TWICE_CA_FILE}:/etc/ssl/certs/ca-certificates.crt:ro`,
		]
	: [];
const bundleSha = readFileSync(
	join(PACKAGE_ROOT, "dist", "bundle.sha256"),
	"utf8",
).trim();

function docker(
	args: string[],
	opts: { stdin?: string; check?: boolean } = {},
): string {
	const proc = Bun.spawnSync(["docker", ...args], {
		stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : undefined,
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = new TextDecoder().decode(proc.stdout);
	if (opts.check !== false && proc.exitCode !== 0) {
		throw new Error(
			`docker ${args.slice(0, 2).join(" ")} failed (${proc.exitCode}): ${new TextDecoder().decode(proc.stderr)}`,
		);
	}
	return out;
}
const exec = (
	cmd: string,
	opts: { user?: string; check?: boolean; on?: string } = {},
) =>
	docker(
		[
			"exec",
			...(opts.user ? ["-u", opts.user] : []),
			opts.on ?? NAME,
			"bash",
			"-lc",
			cmd,
		],
		{ check: opts.check },
	);

/**
 * The way the control plane starts boot: as the image user, through sudo
 * with the secret preserved from the command's env, never on the argv.
 */
function bootAsUser(on = NAME): string {
	const proc = Bun.spawnSync(
		[
			"docker",
			"exec",
			"-u",
			"ubuntu",
			"-e",
			"HOST_SERVICE_SECRET=boot-twice-secret",
			on,
			"sudo",
			"--preserve-env=HOST_SERVICE_SECRET",
			"/usr/local/bin/superset-boot",
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	return `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}exit=${proc.exitCode}`;
}

const assets = loadAssets(join(BUNDLE_SRC, "assets.json"));
const discarded = [
	...discardingSteps(loadSteps(join(BUNDLE_SRC, "steps.json"))).keys(),
].map((key) => assets[key]?.dest ?? key);

const failures: string[] = [];
function expect(label: string, ok: boolean, detail = ""): void {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
	if (!ok) failures.push(label);
}

const identityFields: SandboxIdentity = {
	SUPERSET_SANDBOX_CONTRACT: "1",
	SUPERSET_BUNDLE_SHA: bundleSha,
	SUPERSET_API_URL: "https://api.example.invalid",
	SUPERSET_SANDBOX_WORKSPACE_ID: randomUUID(),
	SUPERSET_SANDBOX_ORGANIZATION_ID: randomUUID(),
	SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
		{
			url: "https://github.com/paradevai/paradev.git",
			branch: "main",
			path: ".",
		},
	]),
	SUPERSET_SANDBOX_IMAGE_TAG: IMAGE,
	SUPERSET_SANDBOX_PROVIDER: "docker",
	SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
		{
			marketplace: "superset",
			name: "linear",
			version: "0.0.0",
			enabled: true,
		},
		{
			marketplace: "acme",
			name: "not-shipped",
			version: "1.0.0",
			enabled: true,
		},
	]),
};
const identity = renderSandboxConf(identityFields);

/**
 * Drive mode, with a tmpfs standing in for the Vercel drive at its mount
 * path: the layout, the store variables, memguard's swap dir and Docker's
 * data-root, then a second boot after the session's bind mounts are gone.
 */
function drivePass(): void {
	const drive = SANDBOX_PATHS.drive;
	const on = DRIVE_NAME;
	docker([
		"run",
		"-d",
		"--name",
		on,
		"--platform",
		"linux/amd64",
		"--privileged",
		"--user",
		"root",
		...CA_MOUNT,
		"--tmpfs",
		`${drive}:exec,mode=0755`,
		IMAGE,
		"sleep",
		"infinity",
	]);
	const driveIdentity: SandboxIdentity = {
		...identityFields,
		SUPERSET_SANDBOX_DRIVE: DRIVE_NAME,
	};
	const writeConf = (fields: SandboxIdentity) =>
		docker(["exec", "-i", on, "bash", "-c", `cat > ${SANDBOX_PATHS.conf}`], {
			stdin: renderSandboxConf(fields),
		});
	writeConf(driveIdentity);
	const bootDrive = () => {
		bootAsUser(on);
		exec(
			`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/host-service.ready ] && exit 0; sleep 0.1; done; exit 1`,
			{ check: false, on },
		);
	};
	const homeMounts = SANDBOX_DRIVE_HOME_SUBTREES.map(
		(sub) => `${SANDBOX_PATHS.home}/${sub}`,
	);
	const allMounted = () =>
		exec(
			[SANDBOX_PATHS.workspace, ...homeMounts]
				.map((path) => `mountpoint -q ${path} || echo "not mounted ${path}"`)
				.join("; "),
			{ check: false, on },
		).trim();

	bootDrive();
	const log = exec(`cat ${SANDBOX_PATHS.bootLog}`, { on });
	expect(
		"drive: layout stamped with its milliseconds",
		/drive\.layout ms=\d+/.test(log),
		log.match(/drive\.layout.*/)?.[0],
	);
	expect(
		"drive: /workspace and every home subtree are bind mounts",
		allMounted() === "",
		allMounted(),
	);
	expect(
		"drive: /workspace is backed by the drive",
		/\/workspace/.test(
			exec(`findmnt -no FSROOT ${SANDBOX_PATHS.workspace}`, {
				check: false,
				on,
			}),
		),
		exec(`findmnt -no SOURCE,FSROOT ${SANDBOX_PATHS.workspace}`, {
			check: false,
			on,
		}).trim(),
	);
	expect(
		"drive: its directories belong to the sandbox user",
		exec(
			`stat -c %U ${drive}/workspace ${drive}/home ${drive}/home/.local ${SANDBOX_PATHS.home}/.local ${SANDBOX_PATHS.home}/.cargo`,
			{ check: false, on },
		).trim() === Array(5).fill("ubuntu").join("\n"),
	);
	const hostEnv = exec(
		`tr '\\0' '\\n' < /proc/$(cat ${SANDBOX_PATHS.run}/host-service.pid)/environ`,
		{ check: false, on },
	);
	expect(
		"drive: host-service gets the stores inside /workspace",
		hostEnv.includes(`BUN_INSTALL_CACHE_DIR=${SANDBOX_DRIVE_STORES.bun}`) &&
			hostEnv.includes(`npm_config_store_dir=${SANDBOX_DRIVE_STORES.pnpm}`),
	);
	expect(
		"drive: a login shell gets them too",
		exec("echo $BUN_INSTALL_CACHE_DIR", {
			user: "ubuntu",
			check: false,
			on,
		}).trim() === SANDBOX_DRIVE_STORES.bun,
	);
	expect(
		"drive: memguard swaps on the drive",
		/swap_dir=\/mnt\/superset-drive\/swap/.test(
			exec(
				`for i in $(seq 1 50); do grep -q swap_dir= ${SANDBOX_PATHS.logs}/memguard.log && break; sleep 0.1; done; cat ${SANDBOX_PATHS.logs}/memguard.log`,
				{ check: false, on },
			),
		),
	);
	expect(
		"drive: Docker's data-root is on the drive, storage driver kept",
		/"data-root":"\/mnt\/superset-drive\/docker"/.test(
			exec("jq -c . /etc/docker/daemon.json", { check: false, on }),
		) &&
			/fuse-overlayfs/.test(
				exec("cat /etc/docker/daemon.json", { check: false, on }),
			),
		exec("cat /etc/docker/daemon.json", { check: false, on }).trim(),
	);
	const checkedOut = /ready/.test(
		exec(
			`for i in $(seq 1 1200); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
			{ check: false, on },
		),
	);
	expect("drive: checkout done", checkedOut);
	expect(
		"drive: the checkout landed on the drive",
		/ok/.test(
			exec(`test -d ${drive}/workspace/.git && echo ok`, { check: false, on }),
		),
	);
	expect(
		"drive: git ignores the stores of a root checkout",
		/\/\.superset\/stores\//.test(
			exec(`cat ${SANDBOX_PATHS.workspace}/.git/info/exclude`, {
				check: false,
				on,
			}),
		),
	);

	// A new session: no processes and no bind mounts survive; the drive does.
	const endSession = () =>
		exec(
			`pkill -u ubuntu -TERM || true; pkill -x superset-memgua || true; sleep 1; pkill -u ubuntu -KILL || true; pkill -x Xvnc || true; rm -rf ${SANDBOX_PATHS.run}; for m in $(findmnt -rn -o TARGET | grep -E '^(${SANDBOX_PATHS.workspace}|${SANDBOX_PATHS.home}/)' | sort -r); do umount -l "$m"; done; : > ${SANDBOX_PATHS.bootLog}`,
			{ check: false, on },
		);
	endSession();
	bootDrive();
	const log2 = exec(`cat ${SANDBOX_PATHS.bootLog}`, { on });
	expect(
		"drive, second boot: layout redone",
		/drive\.layout ms=\d+/.test(log2),
	);
	expect(
		"drive, second boot: every bind mount back",
		allMounted() === "",
		allMounted(),
	);
	expect(
		"drive, second boot: nothing installed",
		/apply-rootfs installed=0/.test(log2),
	);
	expect(
		"drive, second boot: the checkout is still there",
		/checkout\.(skipped|fetched)/.test(
			exec(
				`for i in $(seq 1 600); do grep -qE 'checkout.(skipped|fetched|cloned|clone)' ${SANDBOX_PATHS.bootLog} && break; sleep 0.1; done; cat ${SANDBOX_PATHS.bootLog}`,
				{ check: false, on },
			),
		) || !checkedOut,
		log2.match(/checkout\..*/)?.[0],
	);
	console.log(`\nboot log (drive, second boot):\n${log2}`);

	const state = SANDBOX_PATHS.driveState;
	expect(
		"drive: the drive names its workspace",
		exec(`cat ${state}/workspace-id`, { check: false, on }).trim() ===
			identityFields.SUPERSET_SANDBOX_WORKSPACE_ID,
	);
	expect(
		"drive: host.db and the checkout markers are on the drive, not the root disk",
		exec(
			`test -f ${state}/host.db && test -f ${state}/checkouts/@root && ! test -e ${SANDBOX_PATHS.checkouts}/@root && echo ok`,
			{ check: false, on },
		).trim() === "ok",
		exec(`ls ${state} ${state}/checkouts ${SANDBOX_PATHS.state}`, {
			check: false,
			on,
		}),
	);

	// The user's work: a local commit and an uncommitted file.
	const ws = SANDBOX_PATHS.workspace;
	exec(
		`git -C ${ws} -c user.name=t -c user.email=t@example.invalid commit -q --allow-empty -m user-work && echo user > ${ws}/user-file.txt`,
		{ user: "ubuntu", on },
	);
	const head = () =>
		exec(`git -C ${ws} rev-parse HEAD`, {
			check: false,
			user: "ubuntu",
			on,
		}).trim();
	const work = head();
	const bootAndCheckout = () => {
		bootDrive();
		return exec(
			`for i in $(seq 1 1200); do grep -q 'checkout.end' ${SANDBOX_PATHS.bootLog} && break; sleep 0.1; done; cat ${SANDBOX_PATHS.bootLog}`,
			{ check: false, on },
		);
	};
	const workKept = () =>
		head() === work &&
		exec(`cat ${ws}/user-file.txt`, { check: false, on }).trim() === "user";

	// The root disk rolled back to before the checkout; the drive did not.
	endSession();
	exec(
		`rm -rf ${SANDBOX_PATHS.checkouts} ${SANDBOX_PATHS.hostDb} ${SANDBOX_PATHS.hostDb}-wal ${SANDBOX_PATHS.hostDb}-shm`,
		{ on },
	);
	const rolledBack = bootAndCheckout();
	expect(
		"drive, root rolled back: checkout skipped, the work kept",
		/checkout\.skipped \. /.test(rolledBack) && workKept(),
		rolledBack.match(/checkout\..*/g)?.join(" | "),
	);

	// Even with its marker gone, a checkout that has the branch is the user's.
	endSession();
	exec(`rm -rf ${state}/checkouts`, { on });
	const markerLost = bootAndCheckout();
	expect(
		"drive, marker lost: the branch is kept, not reset",
		/checkout\.kept \. main is already on the drive/.test(markerLost) &&
			workKept(),
		markerLost.match(/checkout\..*/g)?.join(" | "),
	);

	// A fetch that fails must never turn into a reclone over the drive.
	endSession();
	exec(`rm -rf ${state}/checkouts`, { on });
	exec(`git -C ${drive}/workspace branch -q -m main user-main`, {
		user: "ubuntu",
		on,
	});
	writeConf({
		...driveIdentity,
		SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify([
			{
				url: "https://github.com/paradevai/paradev.git",
				branch: "superset/boot-twice-no-such-branch",
				baseBranch: "superset/boot-twice-no-such-branch",
				path: ".",
			},
		]),
	});
	const fetchFailed = bootAndCheckout();
	expect(
		"drive, fetch failed: nothing on the drive is replaced",
		/checkout\.kept \. fetch failed/.test(fetchFailed) &&
			!/checkout\.cloned/.test(fetchFailed) &&
			workKept(),
		fetchFailed.match(/checkout\..*/g)?.join(" | "),
	);
	exec(`git -C ${drive}/workspace branch -q -m user-main main`, {
		user: "ubuntu",
		on,
	});
	writeConf(driveIdentity);

	const refuses = (label: string, phase: string) => {
		const answer = bootAsUser(on);
		const log = exec(`cat ${SANDBOX_PATHS.bootLog}`, { on });
		expect(
			`${label}: refused before host-service, stamped ${phase}`,
			/exit=[1-9]/.test(answer) &&
				new RegExp(`${phase.replace(".", "\\.")} `).test(log) &&
				!/host\.exec|checkout\.start/.test(log) &&
				exec(`mountpoint -q ${ws} && echo bound`, {
					check: false,
					on,
				}).trim() === "",
			log.match(/drive\..*/)?.[0] ?? answer.slice(-200),
		);
	};

	// Another workspace's drive.
	endSession();
	writeConf({ ...driveIdentity, SUPERSET_SANDBOX_WORKSPACE_ID: randomUUID() });
	refuses("drive foreign", "drive.foreign");
	writeConf(driveIdentity);

	// A drive that mounts empty though the workspace was laid out before.
	endSession();
	exec(`umount ${drive} && mount -t tmpfs -o exec,mode=0755 tmpfs ${drive}`, {
		on,
	});
	writeConf({ ...driveIdentity, SUPERSET_SANDBOX_DRIVE_LAID_OUT: "1" });
	refuses("drive empty", "drive.unlaid");

	// A session whose drive did not mount, while sandbox.conf still names one.
	endSession();
	exec(`umount ${drive}`, { on });
	const refused = bootAsUser(on);
	const log3 = exec(`cat ${SANDBOX_PATHS.bootLog}`, { on });
	expect(
		"drive missing: boot exits non-zero",
		/exit=[1-9]/.test(refused),
		refused.slice(-200).replaceAll("\n", " | "),
	);
	expect(
		"drive missing: stamped drive.missing",
		/drive\.missing /.test(log3),
		log3.match(/drive\.missing.*/)?.[0],
	);
	expect(
		"drive missing: no host-service, no checkout",
		!/host\.exec|checkout\.start|steps\.start/.test(log3) &&
			exec(`ls ${SANDBOX_PATHS.run}`, { check: false, on }).trim() === "",
		log3,
	);
	expect(
		"drive missing: /workspace is not bound",
		exec(`mountpoint -q ${SANDBOX_PATHS.workspace} && echo bound`, {
			check: false,
			on,
		}).trim() === "",
	);
}

docker(["rm", "-f", NAME, DRIVE_NAME], { check: false });
// Privileged for the /dev/shm remount and the X socket dir, like the VM. No
// network policy here; the checkout needs the internet.
docker([
	"run",
	"-d",
	"--name",
	NAME,
	"--platform",
	"linux/amd64",
	"--privileged",
	"--user",
	"root",
	...CA_MOUNT,
	IMAGE,
	"sleep",
	"infinity",
]);
try {
	// The identity file, the way the control plane writes it before boot.
	docker(["exec", "-i", NAME, "bash", "-c", `cat > ${SANDBOX_PATHS.conf}`], {
		stdin: identity,
	});
	// host-service answers before the remaining steps finish; a log read for
	// what the steps did waits for this boot's steps.end.
	const waitForSteps = () =>
		exec(
			`for i in $(seq 1 3000); do awk '/ boot\\.start/ { d = 0 } / steps\\.end/ { d = 1 } END { exit !d }' ${SANDBOX_PATHS.bootLog} && exit 0; sleep 0.2; done; exit 1`,
			{ check: false },
		);
	const sinceBootStart = (log: string, phase: string) => {
		const boot = log.split(/(?=^\d+ boot\.start)/m).at(-1) ?? "";
		const at = (p: string) =>
			Number(
				new RegExp(`^(\\d+) ${p.replace(".", "\\.")}\\b`, "m").exec(boot)?.[1],
			);
		return at(phase) - at("boot.start");
	};
	const boot = (n: number) => {
		const started = Date.now();
		bootAsUser();
		// Wait for host-service (up to 60 s) so the second boot sees a clean run dir cleared by the first.
		exec(
			`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/host-service.ready ] && exit 0; sleep 0.1; done; exit 1`,
			{ check: false },
		);
		const elapsed = Date.now() - started;
		waitForSteps();
		const log = exec(`cat ${SANDBOX_PATHS.bootLog}`);
		console.log(
			`boot ${n}: boot.start to host.ready ${sinceBootStart(log, "host.ready")} ms, to steps.end ${sinceBootStart(log, "steps.end")} ms`,
		);
		return elapsed;
	};

	const first = boot(1);
	const log1 = exec(`cat ${SANDBOX_PATHS.bootLog}`);
	// The image may have been built from an older bundle than the one the
	// test pins; the first boot then exercises the update path and must land
	// on the pin either way.
	expect(
		"first boot: bundle is the pinned one",
		new RegExp(`bundle\\.(current|installed) ${bundleSha.slice(0, 12)}`).test(
			log1,
		),
		log1.match(/bundle .*/)?.[0],
	);
	expect(
		"first boot: no step failed",
		!/step \S+ FAILED/.test(log1),
		(log1.match(/step \S+ FAILED.*/g) ?? []).join(", "),
	);
	expect(
		"first boot: host-service ready",
		/host\.ready/.test(log1),
		`${first} ms to ready`,
	);
	expect(
		"host-service listens on its port",
		/200/.test(
			exec(
				`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${SANDBOX_PORTS.hostService}/trpc/health.check`,
				{ check: false },
			),
		),
	);
	expect(
		"host-service refuses without the secret",
		/401/.test(
			exec(
				`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${SANDBOX_PORTS.hostService}/events`,
				{ check: false },
			),
		),
	);
	expect(
		"host-service runs as ubuntu",
		/^ubuntu$/m.test(
			exec(`ps -o user= -p $(cat ${SANDBOX_PATHS.run}/host-service.pid)`, {
				check: false,
			}),
		),
	);
	expect(
		"pid, ready flags and the pty socket live in /run/superset",
		/host-service\.pid[\s\S]*host-service\.ready/.test(
			exec(`ls ${SANDBOX_PATHS.run} | sort | tr '\\n' ' '`),
		),
		exec(`ls ${SANDBOX_PATHS.run} | tr '\\n' ' '`).trim(),
	);
	const display = exec(
		`for i in $(seq 1 300); do [ -f ${SANDBOX_PATHS.run}/display.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
		{ check: false },
	);
	expect("desktop: X ready", /ready/.test(display));
	expect(
		"desktop: websockify listening",
		/LISTEN/.test(
			exec(`ss -ltn | grep ':${SANDBOX_PORTS.desktop} '`, { check: false }),
		),
	);
	expect(
		"desktop: session bus address written for terminals",
		/DBUS_SESSION_BUS_ADDRESS=unix/.test(
			exec(`cat ${SANDBOX_PATHS.run}/desktop.env`, { check: false }),
		),
	);
	expect(
		"desktop: window manager up",
		/window id/.test(
			exec(
				`for i in $(seq 1 240); do DISPLAY=:1 xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && DISPLAY=:1 xprop -root _NET_SUPPORTING_WM_CHECK && exit 0; sleep 0.25; done`,
				{ check: false, user: "ubuntu" },
			),
		),
	);
	// host-service is an asset pinned in bundle/assets.json, so the box runs a
	// published build rather than this checkout: what it does with the plugin
	// list belongs to the release probe and the unit tests. Handing the list
	// over is the bundle's own job, so that is what this checks.
	const hostEnv = exec(
		`tr '\\0' '\\n' < /proc/$(cat ${SANDBOX_PATHS.run}/host-service.pid)/environ`,
		{ check: false, user: "ubuntu" },
	);
	expect(
		"plugins: the runner hands host-service the plugin list",
		/SUPERSET_SANDBOX_PLUGINS=.*not-shipped/.test(hostEnv),
		hostEnv
			.split("\n")
			.find((line) => line.startsWith("SUPERSET_SANDBOX_PLUGINS=")) ?? "unset",
	);

	// The control plane's push, so the runner's hook sequencing runs: this
	// checkout declares no start hook, which the log must say.
	exec(
		`curl -fs -X POST -H 'Authorization: Bearer boot-twice-secret' -H 'Content-Type: application/json' -d '{"json":{"variables":{"FOO":"bar"}}}' http://127.0.0.1:${SANDBOX_PORTS.hostService}/trpc/sandbox.setEnvironment`,
		{ check: false },
	);
	// The clone outlives host-service's readiness; a wake that interrupts it
	// is its own case (the runner reclones), not this test's.
	expect(
		"first boot: checkout done",
		/ready/.test(
			exec(
				`for i in $(seq 1 1200); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
				{ check: false },
			),
		),
	);
	expect(
		"start hook: the runner asked host-service once the push landed",
		/hook\.(none|started)/.test(
			exec(
				`for i in $(seq 1 600); do grep -qE 'hook.' ${SANDBOX_PATHS.bootLog} && break; sleep 0.1; done; cat ${SANDBOX_PATHS.bootLog}`,
				{ check: false },
			),
		),
	);
	expect(
		"no secret on disk",
		!/boot-twice-secret/.test(
			exec(
				`grep -rl boot-twice-secret /etc /var/lib/superset /opt/superset /home 2>/dev/null || true`,
			),
		),
	);
	const leftover = exec(
		`for f in ${discarded.join(" ")}; do [ -e "$f" ] && echo "$f"; [ -f "$f.hash" ] || echo "no sidecar $f"; done; true`,
	).trim();
	expect(
		"first boot: every consumed archive is gone, its sidecar kept",
		leftover === "",
		leftover.replace(/\n/g, ", "),
	);
	expect(
		"status prints every step current",
		!/pending|never run|failed/.test(
			exec(`${SANDBOX_PATHS.bundleRoot}/current/setup status`),
		),
		exec(
			`${SANDBOX_PATHS.bundleRoot}/current/setup status | tail -n +2 | awk '{print $1":"$4}' | tr '\\n' ' '`,
		).trim(),
	);

	// Second boot: stop everything the way a wake would (no processes survive), then boot again.
	exec(
		`pkill -u ubuntu -TERM || true; sleep 1; pkill -u ubuntu -KILL || true; pkill -x Xvnc || true; rm -rf ${SANDBOX_PATHS.run}`,
		{ check: false },
	);
	exec(
		`: > ${SANDBOX_PATHS.bootLog}; mkdir -p ${SANDBOX_PATHS.hostRoot}/previous-runtime && touch ${SANDBOX_PATHS.hostRoot}/previous-runtime/host-service.js`,
	);
	const second = boot(2);
	const runtimes = exec(
		`for i in $(seq 1 100); do [ ! -e ${SANDBOX_PATHS.hostRoot}/previous-runtime ] && break; sleep 0.1; done; find ${SANDBOX_PATHS.hostRoot} -mindepth 1 -maxdepth 1 -type d`,
	).trim();
	const log2 = exec(`cat ${SANDBOX_PATHS.bootLog}`);
	expect("second boot: run dir cleared", /run\.cleared/.test(log2));
	expect(
		"second boot: nothing installed",
		/apply-rootfs installed=0/.test(log2),
	);
	expect("second boot: nothing fetched", !/fetched \//.test(log2));
	expect("second boot: every step skipped", !/step \S+ running/.test(log2));
	const binaries = exec(
		"claude --version && superset --version && echo binaries-ok",
		{ user: "ubuntu", check: false },
	);
	expect(
		"second boot: claude and superset still run from the media dir",
		/binaries-ok/.test(binaries),
		binaries.trim().replace(/\n/g, " | "),
	);
	expect(
		"second boot: host-service ready",
		/host\.ready/.test(log2),
		`${second} ms to ready`,
	);
	expect(
		"second boot: only the current runtime is left once host-service answers",
		runtimes.split("\n").length === 1 &&
			runtimes === exec(`readlink -f ${SANDBOX_PATHS.hostRoot}/current`).trim(),
		runtimes.replaceAll("\n", " "),
	);
	expect(
		"second boot: checkout marker respected",
		/checkout\.(skipped|fetched|cloned)/.test(log2),
		log2.match(/checkout\..*/)?.[0],
	);
	console.log(`\nboot log (second boot):\n${log2}`);

	// The agent-tools drive, stubbed as a directory at its mount path: the
	// listed agent is linked from it, and a session without it falls back to
	// the image's agents rather than to links that point nowhere.
	const stop = () =>
		exec(
			`pkill -u ubuntu -TERM || true; sleep 1; pkill -u ubuntu -KILL || true; pkill -x Xvnc || true; rm -rf ${SANDBOX_PATHS.run}`,
			{ check: false },
		);
	const stubSha = "f".repeat(64);
	stop();
	exec(
		`: > ${SANDBOX_PATHS.bootLog}; for name in claude pi; do mkdir -p ${SANDBOX_PATHS.agents}/$name/${stubSha} && printf '#!/bin/sh\\necho drive-%s\\n' $name > ${SANDBOX_PATHS.agents}/$name/${stubSha}/$name && chmod 755 ${SANDBOX_PATHS.agents}/$name/${stubSha}/$name; done && printf '%s' '${JSON.stringify(
			[
				{ name: "claude", sha: stubSha, bin: "claude" },
				{ name: "pi", sha: stubSha, bin: "pi" },
			],
		)}' > ${SANDBOX_PATHS.agents}/manifest.json`,
	);
	boot(3);
	const logDrive = exec(`cat ${SANDBOX_PATHS.bootLog}`);
	expect(
		"drive: listed agents linked",
		/agents\.linked 2/.test(logDrive) &&
			/drive-claude/.test(exec("claude", { check: false, user: "ubuntu" })) &&
			/drive-pi/.test(exec("pi", { check: false, user: "ubuntu" })),
		logDrive.match(/agents\..*/)?.[0],
	);
	stop();
	exec(`: > ${SANDBOX_PATHS.bootLog}; rm -rf ${SANDBOX_PATHS.agents}`);
	const noDriveExit = bootAsUser();
	exec(
		`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/host-service.ready ] && exit 0; sleep 0.1; done; exit 1`,
		{ check: false },
	);
	const logNoDrive = exec(`cat ${SANDBOX_PATHS.bootLog}`);
	expect(
		"no drive: boot exits 0 and host-service ready",
		/exit=0/.test(noDriveExit) && /host\.ready/.test(logNoDrive),
	);
	expect(
		"no drive: stamped unavailable",
		/agents\.unavailable/.test(logNoDrive),
	);
	expect(
		"no drive: image claude back on PATH",
		exec("readlink -f /usr/local/bin/claude", { check: false }).startsWith(
			SANDBOX_PATHS.media,
		),
		exec("readlink -f /usr/local/bin/claude", { check: false }).trim(),
	);
	expect(
		"no drive: a drive-only agent's link is gone",
		exec("test -L /usr/local/bin/pi && echo dangling", {
			check: false,
		}).trim() === "",
	);

	// Third boot, with host-service deliberately broken: the box must stay
	// alive, the desktop must still come up, and the log must say so.
	exec(
		`pkill -u ubuntu -TERM || true; sleep 1; pkill -u ubuntu -KILL || true; pkill -x Xvnc || true; rm -rf ${SANDBOX_PATHS.run}`,
		{ check: false },
	);
	exec(
		`: > ${SANDBOX_PATHS.bootLog}; mv ${SANDBOX_PATHS.hostRoot}/current/host-service.js ${SANDBOX_PATHS.hostRoot}/current/host-service.js.broken`,
	);
	const brokenExit = bootAsUser();
	expect("broken host-service: boot exits 0", /exit=0/.test(brokenExit));
	expect(
		"broken host-service: desktop still comes up",
		/ready/.test(
			exec(
				`for i in $(seq 1 300); do [ -f ${SANDBOX_PATHS.run}/display.ready ] && echo ready && exit 0; sleep 0.1; done; echo missing`,
				{ check: false },
			),
		),
	);
	const log3 = exec(
		`for i in $(seq 1 700); do grep -qE 'host\\.(timeout|missing)' ${SANDBOX_PATHS.bootLog} && break; sleep 0.1; done; cat ${SANDBOX_PATHS.bootLog}`,
		{ check: false },
	);
	expect(
		"broken host-service: boot log names the failure",
		/host\.(timeout|missing)/.test(log3),
		log3.match(/host\.(timeout|missing).*/)?.[0],
	);
	expect(
		"broken host-service: no ready flag",
		!/host-service\.ready/.test(
			exec(`ls ${SANDBOX_PATHS.run}`, { check: false }),
		),
	);

	drivePass();
} finally {
	docker(["rm", "-f", NAME, DRIVE_NAME], { check: false });
}
if (failures.length) {
	console.error(
		`\n${failures.length} expectation(s) failed: ${failures.join("; ")}`,
	);
	process.exit(1);
}
console.log("\nboot-twice: all expectations met");
