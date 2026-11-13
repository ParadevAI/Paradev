import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLOUD_AGENT_LAUNCH_ENV_NAMES } from "@superset/shared/cloud-agent-launch";

const boot = readFileSync(
	join(import.meta.dir, "../bundle/rootfs/usr/local/bin/superset-boot"),
	"utf8",
);

const memguard = readFileSync(
	join(import.meta.dir, "../bundle/rootfs/usr/local/bin/superset-memguard"),
	"utf8",
);

describe("superset-boot", () => {
	test("starts memguard after host-service, detached from the boot lock", () => {
		const hostStart = boot.indexOf("start_host_service\n");
		const memguardStart = boot.indexOf("/usr/local/bin/superset-memguard >>");
		expect(hostStart).toBeGreaterThan(0);
		expect(memguardStart).toBeGreaterThan(hostStart);
		expect(boot.slice(memguardStart)).toMatch(
			/superset-memguard >> [^\n]* 9>&- &/,
		);
	});

	test("memguard ranks the box above sessions above everything else, and never pid 1", () => {
		expect(memguard).toMatch(/host_pid.*\n\s*want=-900/);
		expect(memguard).toMatch(/claude.*codex.*\n\s*want=-300/);
		expect(memguard).toMatch(
			/Xvnc.*xfce4-session.*xfwm4.*websockify.*\n\s*want=-300/,
		);
		expect(memguard).toMatch(/\[ "\$pid" = 1 \]/);
		expect(memguard).toMatch(
			/victim_at_or_above 500 \|\| victim_at_or_above 0 \|\| victim_at_or_above -300/,
		);
	});

	test("swap is memguard's, grown on demand up to a cap by box size", () => {
		expect(boot).not.toMatch(/swapon/);
		expect(memguard).toMatch(/swap_cap_mb=\$\(\( \$\(box_mb\) \* 3 \/ 2 \)\)/);
		expect(memguard).toMatch(/-lt 6144 \] && swap_cap_mb=6144/);
		expect(memguard).toMatch(/-gt 16384 \] && swap_cap_mb=16384/);
		expect(memguard).toMatch(/swapon "\$f"/);
		expect(memguard).toMatch(/swapoff "\$f"/);
	});

	test("writes the cgroup's memory ceiling and CPU count for login shells", () => {
		expect(boot).toMatch(/SUPERSET_SANDBOX_MEMORY_MB/);
		expect(boot).toMatch(/SUPERSET_SANDBOX_VCPUS/);
		expect(boot).toMatch(/\/sys\/fs\/cgroup\/memory\.max/);
	});

	test("hands each repository's requireBase to checkout_one", () => {
		expect(boot).toContain(
			`[.url, .branch, .path, (if .requireBase then "1" else "0" end), (.baseBranch // "")]`,
		);
		expect(boot).toContain(`read -r url branch path require base; do`);
	});

	describe("checkout_one", () => {
		const dir = mkdtempSync(join(tmpdir(), "superset-boot-"));
		const gitEnv = {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.com",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.com",
		};
		const git = (...args: string[]) =>
			execFileSync("git", args, { env: gitEnv, stdio: "pipe" });
		git("init", "-q", "-b", "main", join(dir, "src"));
		writeFileSync(join(dir, "src", "on-main"), "");
		git("-C", join(dir, "src"), "add", "on-main");
		git("-C", join(dir, "src"), "commit", "-q", "-m", "main");
		git("clone", "-q", "--bare", join(dir, "src"), join(dir, "remote.git"));
		const fn = boot.match(/^checkout_one\(\) \{\n[\s\S]*?\n\}\n/m)?.[0];
		const harness = join(dir, "harness.sh");
		writeFileSync(
			harness,
			[
				"set -uo pipefail",
				'stamp() { printf "%s\\n" "$*" >> "$SUPERSET_WORKSPACE_DIR/../stamps"; }',
				'as_user() { "$@"; }',
				"chown() { :; }",
				'install() { local last; for last; do :; done; mkdir -p "$last"; }',
				fn ?? "exit 99",
				'checkout_one "$@"',
			].join("\n"),
		);

		function checkoutOne(path: string, require: "0" | "1", base: string) {
			const workspace = join(dir, "workspace");
			const checkouts = join(dir, "checkouts");
			mkdirSync(workspace, { recursive: true });
			mkdirSync(checkouts, { recursive: true });
			const run = spawnSync(
				"bash",
				[
					harness,
					`file://${dir}/remote.git`,
					"superset/work",
					path,
					require,
					base,
				],
				{
					env: {
						...gitEnv,
						SUPERSET_WORKSPACE_DIR: workspace,
						SUPERSET_CHECKOUTS_DIR: checkouts,
						SUPERSET_USER: "ubuntu",
					},
				},
			);
			return {
				status: run.status,
				marker: existsSync(join(checkouts, path)),
				onMain: existsSync(join(workspace, path, "on-main")),
			};
		}

		afterAll(() => rmSync(dir, { recursive: true, force: true }));

		test("a missing required base fails and leaves no marker", () => {
			expect(checkoutOne("required", "1", "gone")).toEqual({
				status: 1,
				marker: false,
				onMain: false,
			});
		});

		test("a missing base that is not required falls back to the default branch", () => {
			expect(checkoutOne("fallback", "0", "gone")).toEqual({
				status: 0,
				marker: true,
				onMain: true,
			});
		});
	});

	test.each([
		...CLOUD_AGENT_LAUNCH_ENV_NAMES,
	])("hands %s to host-service", (name) => {
		expect(boot).toMatch(new RegExp(`\\b${name}\\b`));
	});
});
