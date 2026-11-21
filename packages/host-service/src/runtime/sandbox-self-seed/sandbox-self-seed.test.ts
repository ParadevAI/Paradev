import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
import {
	readPendingLaunchReport,
	withoutPendingLaunchReport,
	withPendingLaunchReport,
} from "./launchMarker";
import {
	type RunTerminalStarter,
	resumeSandboxStartHookRun,
	runSandboxStartHook,
	type SandboxIdentity,
	type StartHookFiles,
	startHookPlan,
} from "./sandbox-self-seed";

const claim = "claude 2026-05-01T00:00:00.000Z\n";
const report = {
	kind: "chat" as const,
	sessionId: "22222222-2222-4222-8222-222222222222",
	terminalId: "term-1",
	automationRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("launch marker recovery", () => {
	test("keeps a pending report beside the claim so a restart does not relaunch", () => {
		const marker = withPendingLaunchReport(claim, report);
		expect(readPendingLaunchReport(marker)).toEqual(report);
		expect(marker.startsWith("claude ")).toBe(true);
		const cleared = withoutPendingLaunchReport(marker);
		expect(readPendingLaunchReport(cleared)).toBeNull();
		expect(cleared.startsWith("claude ")).toBe(true);
	});

	test("ignores a claim with no pending report", () => {
		expect(readPendingLaunchReport(claim)).toBeNull();
		expect(readPendingLaunchReport("pending-report not-json\n")).toBeNull();
	});
});

describe("startHookPlan", () => {
	let root: string;
	let previousRunMode: string | undefined;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "start-hook-test-"));
		previousRunMode = process.env.SUPERSET_HOST_RUN_MODE;
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		if (previousRunMode === undefined)
			delete process.env.SUPERSET_HOST_RUN_MODE;
		else process.env.SUPERSET_HOST_RUN_MODE = previousRunMode;
	});

	function planFor(toml: string) {
		mkdirSync(join(root, ".superset"), { recursive: true });
		writeFileSync(join(root, ".superset", "config.toml"), toml, "utf-8");
		return startHookPlan({
			worktreePath: root,
			workspaceId: "ws-1",
		} as SandboxIdentity);
	}

	test("runs the cloud setup, then the default terminal", () => {
		expect(
			planFor(
				'[setup]\nrun = "local-setup"\n[setup.cloud]\nrun = "cloud-setup"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
			),
		).toEqual({ setup: "cloud-setup", run: { command: "bun dev" } });
	});

	test("chains setup so it stops at its first failure", () => {
		expect(
			planFor(
				'[setup.cloud]\nrun = ["false", "touch ready"]\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
			),
		).toEqual({
			setup: "false && touch ready",
			run: { command: "bun dev" },
		});
	});

	test("keeps the default terminal's cwd for its terminal session", () => {
		expect(
			planFor(
				'[terminals.web]\nrun = "npm run dev"\ncwd = "apps/web"\ndefault = true\n',
			),
		).toEqual({
			setup: null,
			run: { command: "npm run dev", cwd: "apps/web" },
		});
	});
});

describe("start hook run terminal", () => {
	let root: string;
	let files: StartHookFiles;
	let previousRunMode: string | undefined;
	const ctx = {} as Parameters<typeof runSandboxStartHook>[0];

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "start-hook-run-"));
		files = {
			marker: join(root, "start-hook.pid"),
			log: join(root, "start-hook.log"),
			runTerminal: join(root, "start-hook-run-terminal"),
		};
		previousRunMode = process.env.SUPERSET_HOST_RUN_MODE;
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		if (previousRunMode === undefined)
			delete process.env.SUPERSET_HOST_RUN_MODE;
		else process.env.SUPERSET_HOST_RUN_MODE = previousRunMode;
	});

	function identityWith(toml: string): SandboxIdentity {
		mkdirSync(join(root, ".superset"), { recursive: true });
		writeFileSync(join(root, ".superset", "config.toml"), toml, "utf-8");
		return { worktreePath: root, workspaceId: "ws-1" } as SandboxIdentity;
	}

	function fakeStarter(live: string[] = []) {
		const started: string[] = [];
		const starter: RunTerminalStarter = {
			isLive: async (terminalId) => live.includes(terminalId),
			start: async (run) => {
				started.push(run.command);
				return { terminalId: `term-${started.length}`, pid: 4242 };
			},
		};
		return { starter, started };
	}

	async function until(check: () => boolean) {
		for (let i = 0; i < 200 && !check(); i++) await Bun.sleep(10);
	}

	test("starts the run terminal once setup exits and records it", async () => {
		const identity = identityWith(
			'[setup.cloud]\nrun = "true"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		const { starter, started } = fakeStarter();
		await runSandboxStartHook(ctx, identity, { files, starter });
		await until(() => started.length > 0);
		expect(started).toEqual(["bun dev"]);
		expect(readFileSync(files.runTerminal, "utf8").trim()).toBe("term-1");
	});

	test("a multi-line setup command never reaches the log; its exit is stamped in the boot log", async () => {
		const bootLog = join(root, "boot.log");
		const previousBootLog = process.env.SUPERSET_SANDBOX_BOOT_LOG;
		process.env.SUPERSET_SANDBOX_BOOT_LOG = bootLog;
		const printed: unknown[] = [];
		const spies = (["log", "warn", "error"] as const).map((method) =>
			spyOn(console, method).mockImplementation((...args) => {
				printed.push(...args);
			}),
		);
		try {
			const identity = identityWith(
				'[setup.cloud]\nrun = """\necho LINE-ONE\necho LINE-TWO-SECRET\nexit 3\n"""\n',
			);
			const outcome = await runSandboxStartHook(ctx, identity, {
				files,
				starter: fakeStarter().starter,
			});
			expect(outcome).toMatchObject({ started: false, exitCode: 3 });
			await until(() => readFileSync(bootLog, "utf8").includes("hook."));
		} finally {
			for (const spy of spies) spy.mockRestore();
			if (previousBootLog === undefined)
				delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
			else process.env.SUPERSET_SANDBOX_BOOT_LOG = previousBootLog;
		}
		expect(JSON.stringify(printed)).not.toMatch(/LINE-ONE|LINE-TWO-SECRET/);
		expect(printed.join("\n")).toMatch(
			/\[sandbox\] start hook failed \(exit 3\) \(command of \d+ chars\)/,
		);
		expect(readFileSync(bootLog, "utf8")).toMatch(
			/^\d{13} hook\.failed exit=3 ms=\d+\n$/,
		);
	});

	test("a setup that succeeds is stamped exited 0 in the boot log", async () => {
		const bootLog = join(root, "boot.log");
		const previousBootLog = process.env.SUPERSET_SANDBOX_BOOT_LOG;
		process.env.SUPERSET_SANDBOX_BOOT_LOG = bootLog;
		try {
			const identity = identityWith('[setup.cloud]\nrun = "true"\n');
			await runSandboxStartHook(ctx, identity, {
				files,
				starter: fakeStarter().starter,
			});
			await until(() => existsSync(bootLog));
		} finally {
			if (previousBootLog === undefined)
				delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
			else process.env.SUPERSET_SANDBOX_BOOT_LOG = previousBootLog;
		}
		expect(readFileSync(bootLog, "utf8")).toMatch(
			/^\d{13} hook\.exited exit=0 ms=\d+\n$/,
		);
	});

	test("a forced re-run keeps the run terminal that is still live", async () => {
		const identity = identityWith(
			'[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		writeFileSync(files.runTerminal, "term-live\n");
		const { starter, started } = fakeStarter(["term-live"]);
		const outcome = await runSandboxStartHook(ctx, identity, {
			force: true,
			files,
			starter,
		});
		expect(outcome.started).toBe(true);
		expect(started).toEqual([]);
	});

	test("after a restart, starts the run once the recorded setup has exited", async () => {
		const identity = identityWith(
			'[setup.cloud]\nrun = "true"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		const exitedSetup = spawnSync("true").pid;
		writeFileSync(files.marker, `${exitedSetup}\n`);
		const { starter, started } = fakeStarter();
		await resumeSandboxStartHookRun(ctx, identity, { files, starter });
		expect(started).toEqual(["bun dev"]);
	});

	test("after a restart, re-attaches the recorded run terminal", async () => {
		const identity = identityWith(
			'[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		writeFileSync(files.runTerminal, "term-live\n");
		const checked: string[] = [];
		const { starter, started } = fakeStarter();
		starter.isLive = async (terminalId) => {
			checked.push(terminalId);
			return true;
		};
		await resumeSandboxStartHookRun(ctx, identity, { files, starter });
		expect(checked).toEqual(["term-live"]);
		expect(started).toEqual([]);
	});

	test("two callers at once start one run terminal", async () => {
		const identity = identityWith(
			'[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
		);
		const { starter, started } = fakeStarter();
		await Promise.all([
			runSandboxStartHook(ctx, identity, { force: true, files, starter }),
			runSandboxStartHook(ctx, identity, { force: true, files, starter }),
		]);
		expect(started).toEqual(["bun dev"]);
	});
});
