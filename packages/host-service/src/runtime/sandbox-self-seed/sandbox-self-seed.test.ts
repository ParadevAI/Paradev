import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readPendingLaunchReport,
	withoutPendingLaunchReport,
	withPendingLaunchReport,
} from "./launchMarker";
import { type SandboxIdentity, startHookCommands } from "./sandbox-self-seed";

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

describe("startHookCommands", () => {
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

	function commandsFor(toml: string) {
		mkdirSync(join(root, ".superset"), { recursive: true });
		writeFileSync(join(root, ".superset", "config.toml"), toml, "utf-8");
		return startHookCommands({
			worktreePath: root,
			workspaceId: "ws-1",
		} as SandboxIdentity);
	}

	test("runs the cloud setup, then the default terminal", () => {
		expect(
			commandsFor(
				'[setup]\nrun = "local-setup"\n[setup.cloud]\nrun = "cloud-setup"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
			),
		).toEqual(["cloud-setup", "bun dev"]);
	});

	test("stops setup at its first failure but still starts the terminal", () => {
		expect(
			commandsFor(
				'[setup.cloud]\nrun = ["false", "touch ready"]\n[terminals.dev]\nrun = "bun dev"\ndefault = true\n',
			),
		).toEqual(["false && touch ready", "bun dev"]);
	});
});
