import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
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
			isLive: (terminalId) => live.includes(terminalId),
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
});
