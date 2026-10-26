import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AGENT_SETUP_TARGETS } from "./agent-setup-targets";
import {
	AGY_HOOK_MARKER,
	AGY_HOOK_NAMESPACE,
	createAgyHookScript,
	createAgyHooksJson,
	createAgyWrapper,
	getAgyHookScriptContent,
	getAgyHookScriptPath,
	getAgyHooksJsonPath,
	getAgyManagedHookCommand,
	removeAgyManagedHooks,
} from "./agent-wrappers-agy";
import { getWrapperPath } from "./agent-wrappers-common";

type HooksJson = Record<string, Record<string, unknown[]>>;

const originalHome = process.env.HOME;
const originalSupersetHome = process.env.SUPERSET_HOME_DIR;

let root: string;

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "agy-wrappers-"));
	process.env.HOME = path.join(root, "home");
	process.env.SUPERSET_HOME_DIR = path.join(root, "superset");
});

afterEach(() => {
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	if (originalSupersetHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = originalSupersetHome;
	rmSync(root, { recursive: true, force: true });
});

function readHooksJson(): HooksJson {
	return JSON.parse(readFileSync(getAgyHooksJsonPath(), "utf-8"));
}

function writeHooksJson(content: unknown): void {
	mkdirSync(path.dirname(getAgyHooksJsonPath()), { recursive: true });
	writeFileSync(getAgyHooksJsonPath(), JSON.stringify(content, null, 2));
}

const userNamespace = {
	"creft-pipeline": {
		SessionStart: [{ type: "command", command: "creft _hooks context adrs" }],
		PostToolUse: [
			{
				matcher: "write_to_file",
				hooks: [{ type: "command", command: "creft _hooks guard lint" }],
			},
		],
	},
};

describe("agy setup target", () => {
	it("is registered as a managed binary", () => {
		expect(AGENT_SETUP_TARGETS).toContainEqual({
			id: "agy",
			managedBinary: true,
		});
	});
});

describe("agy wrapper", () => {
	it("exports the agy identity and execs the real binary", () => {
		mkdirSync(path.dirname(getWrapperPath("agy")), { recursive: true });
		createAgyWrapper();
		const wrapper = readFileSync(getWrapperPath("agy"), "utf-8");
		expect(wrapper).toContain("# Superset wrapper for agy");
		expect(wrapper).toContain('REAL_BIN="$(find_real_binary "agy")"');
		expect(wrapper).toContain('export SUPERSET_AGENT_ID="agy"');
		expect(wrapper).toContain('exec "$REAL_BIN" "$@"');
	});
});

describe("agy hooks.json", () => {
	it("creates the file with only the Superset namespace", () => {
		createAgyHooksJson();
		const hooks = readHooksJson();
		expect(Object.keys(hooks)).toEqual([AGY_HOOK_NAMESPACE]);
		expect(Object.keys(hooks[AGY_HOOK_NAMESPACE] ?? {}).sort()).toEqual([
			"PostToolUse",
			"PreInvocation",
			"SessionStart",
			"Stop",
		]);
	});

	it("registers flat command entries and a matcher entry for PostToolUse", () => {
		createAgyHooksJson();
		const events = readHooksJson()[AGY_HOOK_NAMESPACE] ?? {};
		for (const event of ["SessionStart", "PreInvocation", "Stop"]) {
			expect(events[event]).toEqual([
				{ type: "command", command: getAgyManagedHookCommand(event) },
			]);
		}
		expect(events.PostToolUse).toEqual([
			{
				matcher: ".*",
				hooks: [
					{
						type: "command",
						command: getAgyManagedHookCommand("PostToolUse"),
					},
				],
			},
		]);
	});

	it("preserves other namespaces and stays idempotent", () => {
		writeHooksJson(userNamespace);
		createAgyHooksJson();
		const first = readFileSync(getAgyHooksJsonPath(), "utf-8");
		createAgyHooksJson();
		expect(readFileSync(getAgyHooksJsonPath(), "utf-8")).toBe(first);

		const hooks = readHooksJson();
		expect(hooks["creft-pipeline"]).toEqual(userNamespace["creft-pipeline"]);
		expect(hooks[AGY_HOOK_NAMESPACE]?.Stop).toHaveLength(1);
	});

	it("replaces stale managed commands from old install paths", () => {
		writeHooksJson({
			[AGY_HOOK_NAMESPACE]: {
				SessionStart: [
					{
						type: "command",
						command: "/tmp/worktree/superset-dev-data/hooks/agy-hook.sh",
					},
				],
				PostToolUse: [
					{
						matcher: ".*",
						hooks: [
							{
								type: "command",
								command: "/Users/x/.superset/hooks/agy-hook.sh PostToolUse",
							},
						],
					},
				],
			},
		});
		createAgyHooksJson();
		const events = readHooksJson()[AGY_HOOK_NAMESPACE] ?? {};
		expect(events.SessionStart).toEqual([
			{ type: "command", command: getAgyManagedHookCommand("SessionStart") },
		]);
		expect(events.PostToolUse).toHaveLength(1);
	});

	it("leaves an unparseable file untouched", () => {
		mkdirSync(path.dirname(getAgyHooksJsonPath()), { recursive: true });
		writeFileSync(getAgyHooksJsonPath(), "{ not json");
		createAgyHooksJson();
		expect(readFileSync(getAgyHooksJsonPath(), "utf-8")).toBe("{ not json");
	});

	it("teardown removes only the Superset namespace", () => {
		writeHooksJson(userNamespace);
		createAgyHooksJson();
		removeAgyManagedHooks();
		expect(readHooksJson()).toEqual(userNamespace);
	});

	it("teardown does not create the file", () => {
		removeAgyManagedHooks();
		expect(existsSync(getAgyHooksJsonPath())).toBe(false);
	});
});

describe("agy managed hook command", () => {
	function runCommand(env: Record<string, string>) {
		return Bun.spawnSync({
			cmd: ["bash", "-c", getAgyManagedHookCommand("Stop")],
			env: { PATH: process.env.PATH ?? "", ...env },
			stdin: Buffer.from("{}"),
			stdout: "pipe",
			stderr: "pipe",
		});
	}

	it("prints {} when SUPERSET_HOME_DIR is unset", () => {
		const result = runCommand({});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
	});

	it("prints {} when the hook script is not installed", () => {
		const result = runCommand({ SUPERSET_HOME_DIR: root });
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
	});
});

describe("agy-hook.sh", () => {
	let notifyOutput: string;

	beforeEach(() => {
		mkdirSync(path.dirname(getAgyHookScriptPath()), { recursive: true });
		createAgyHookScript();
		notifyOutput = path.join(root, "notify-input.txt");
		const fakeNotify = path.join(
			path.dirname(getAgyHookScriptPath()),
			"notify.sh",
		);
		writeFileSync(
			fakeNotify,
			`#!/bin/bash\n{ cat; printf '\\nharness=%s\\n' "$SUPERSET_HOOK_HARNESS"; } > "${notifyOutput}"\n`,
		);
		chmodSync(fakeNotify, 0o755);
	});

	function runHook(
		event: string,
		payload: Record<string, unknown>,
		env: Record<string, string> = { SUPERSET_TERMINAL_ID: "terminal-1" },
	) {
		return Bun.spawnSync({
			cmd: [getAgyHookScriptPath(), event],
			env: { PATH: process.env.PATH ?? "", ...env },
			stdin: Buffer.from(JSON.stringify(payload)),
			stdout: "pipe",
			stderr: "pipe",
		});
	}

	function forwarded(): { payload: Record<string, string>; harness: string } {
		const [json, harnessLine] = readFileSync(notifyOutput, "utf-8").split("\n");
		return {
			payload: JSON.parse(json ?? ""),
			harness: (harnessLine ?? "").replace("harness=", ""),
		};
	}

	it("carries the version marker", () => {
		expect(getAgyHookScriptContent()).toContain(AGY_HOOK_MARKER);
	});

	it("maps PreInvocation to UserPromptSubmit with the conversation id", () => {
		const result = runHook("PreInvocation", { conversationId: "conv-1" });
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
		expect(forwarded()).toEqual({
			payload: { hook_event_name: "UserPromptSubmit", session_id: "conv-1" },
			harness: "agy",
		});
	});

	for (const event of ["SessionStart", "PostToolUse", "Stop"]) {
		it(`forwards ${event} unchanged`, () => {
			runHook(event, { conversationId: "conv-2", fullyIdle: true });
			expect(forwarded().payload).toEqual({
				hook_event_name: event,
				session_id: "conv-2",
			});
		});
	}

	it("does not forward Stop while agy is not fully idle", () => {
		const result = runHook("Stop", { conversationId: "c", fullyIdle: false });
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
		expect(existsSync(notifyOutput)).toBe(false);
	});

	it("prints {} and stays silent outside a Superset terminal", () => {
		const result = runHook("Stop", { conversationId: "c" }, {});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
		expect(existsSync(notifyOutput)).toBe(false);
	});

	it("ignores events fired under another agent's identity", () => {
		const result = runHook(
			"Stop",
			{ conversationId: "c" },
			{ SUPERSET_TERMINAL_ID: "terminal-1", SUPERSET_AGENT_ID: "claude" },
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
		expect(existsSync(notifyOutput)).toBe(false);
	});

	it("ignores unknown event names", () => {
		const result = runHook("PreToolUse", { conversationId: "c" });
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("{}\n");
		expect(existsSync(notifyOutput)).toBe(false);
	});
});
