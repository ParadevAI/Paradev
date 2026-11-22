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

	test("memguard reaps below the floor, or a check before a fast fall reaches it", () => {
		expect(memguard).toMatch(
			/if \[ \$\(\( mem_avail - drop \)\) -lt "\$floor" \]; then\n\s*scan\n\s*victim=/,
		);
	});

	test("memguard's loop forks nothing between checks, and kills before it logs", () => {
		expect(memguard).not.toMatch(/^\s*sleep /m);
		expect(memguard).toMatch(/pause 0\.25\ndone\s*$/);
		expect(memguard).toMatch(
			/kill -9 "\$victim" 2>\/dev\/null &&\n\s*log "reap /,
		);
	});

	test("memguard logs pressure it cannot relieve once per episode, not every check", () => {
		expect(memguard).toMatch(
			/\[ "\$pressed" = 1 \] \|\| log "pressure [^\n]*\n\s*pressed=1\n\s*else\n\s*pressed=0/,
		);
	});

	test("a process that exits during a memguard scan writes no error to its log", () => {
		expect(memguard).not.toMatch(/[<>] "[^"]*" 2>\/dev\/null/);
		expect(memguard).toMatch(/2>\/dev\/null < "\$p\/status"/);
	});

	test("starts host-service after only the before-host steps; the rest run detached after it", () => {
		const hostSteps = boot.indexOf('"$BUNDLE/setup" run-steps before-host');
		const link = boot.indexOf("\nlink_agents\n");
		const host = boot.indexOf("\nstart_host_service\n");
		const assets = boot.indexOf('"$BUNDLE/setup" sync-assets');
		const rest = boot.indexOf('"$BUNDLE/setup" run-steps after-host');
		const desktop = boot.indexOf("/usr/local/bin/superset-desktop-init");
		expect(hostSteps).toBeGreaterThan(0);
		expect(link).toBeGreaterThan(hostSteps);
		expect(host).toBeGreaterThan(link);
		expect(assets).toBeGreaterThan(host);
		expect(rest).toBeGreaterThan(assets);
		expect(desktop).toBeGreaterThan(rest);
		expect(boot).toMatch(/stamp "agents\.unavailable/);
	});

	test("marks the checkout ready only once the remaining steps are done", () => {
		const rest = boot.indexOf('"$BUNDLE/setup" run-steps after-host');
		const ready = boot.indexOf('/checkout.ready" && start_hook');
		expect(ready).toBeGreaterThan(rest);
		expect(boot.slice(rest, ready)).toMatch(/wait "\$checkout_pid"/);
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
