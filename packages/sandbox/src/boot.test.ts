import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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

	test("nothing turns swap on, and an earlier bundle's swapfiles are removed", () => {
		expect(boot).not.toMatch(/swapon/);
		expect(memguard).not.toMatch(/swapon|mkswap|fallocate/);
		expect(memguard).toMatch(
			/\/var\/swap\/superset-\*.*swapoff "\$f".*rm -f "\$f"/,
		);
		expect(boot).toMatch(/rm -f \/swapfile/);
	});

	test("memguard reaps on available memory alone", () => {
		expect(memguard).toMatch(
			/if \[ "\$mem_avail" -lt "\$floor" \]; then\n\s*victim=/,
		);
	});

	test("writes the cgroup's memory ceiling and CPU count for login shells", () => {
		expect(boot).toMatch(/SUPERSET_SANDBOX_MEMORY_MB/);
		expect(boot).toMatch(/SUPERSET_SANDBOX_VCPUS/);
		expect(boot).toMatch(/\/sys\/fs\/cgroup\/memory\.max/);
	});

	test.each([
		...CLOUD_AGENT_LAUNCH_ENV_NAMES,
	])("hands %s to host-service", (name) => {
		expect(boot).toMatch(new RegExp(`\\b${name}\\b`));
	});
});
