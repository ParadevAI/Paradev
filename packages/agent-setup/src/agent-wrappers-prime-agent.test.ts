import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { teardownSingleAgent } from "./agent-setup";
import {
	createPrimeAgentExtension,
	createPrimeAgentWrapper,
	getPrimeAgentExtensionPath,
} from "./agent-wrappers-prime-agent";

const home = mkdtempSync(path.join(tmpdir(), "superset-prime-agent-"));
const previousHome = process.env.SUPERSET_HOME_DIR;
let bridgePath: string;
process.env.SUPERSET_HOME_DIR = home;

afterAll(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(home, { recursive: true, force: true });
});

describe("Prime Agent integration", () => {
	it("passes an environment-scoped extension and keeps user arguments", () => {
		mkdirSync(path.join(home, "hooks"), { recursive: true });
		mkdirSync(path.join(home, "bin"), { recursive: true });
		createPrimeAgentExtension();
		createPrimeAgentWrapper();
		const realBin = path.join(home, "real-bin");
		mkdirSync(realBin);
		writeFileSync(
			path.join(realBin, "prime-agent"),
			`#!/bin/bash
if [ "$1" = "--help" ]; then
  [ "$PRIME_TEST_NO_EXTENSION" = "1" ] || echo "  -e, --extension <path>  Load an extension"
  exit 0
fi
if [ "$1" = "--extension" ] && [ "$PRIME_TEST_REUSE" != "1" ]; then
  node --input-type=module -e '
    const { default: extension } = await import(process.argv[1]);
    extension({ on() {}, registerTool() {} });
  ' "$2" || exit $?
fi
printf '%s\n' "$@"
exit "\${PRIME_TEST_EXIT_CODE:-0}"
`,
			{ mode: 0o755 },
		);
		chmodSync(path.join(realBin, "prime-agent"), 0o755);
		const run = (terminalId: string, argv = ["--resume", "session-1"]) =>
			spawnSync(path.join(home, "bin", "prime-agent"), argv, {
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: terminalId,
					SUPERSET_AGENT_ID: "",
					SUPERSET_HOOK_VERSION: "2",
					PATH: `${path.join(home, "bin")}:${realBin}:${process.env.PATH}`,
				},
			});
		const inTerminal = run("terminal-1");
		expect(inTerminal.status).toBe(0);
		const args = inTerminal.stdout.trim().split("\n");
		bridgePath = args[1] ?? "";
		expect(args).toEqual(["--extension", bridgePath, "--resume", "session-1"]);
		const bridge = readFileSync(bridgePath, "utf8");
		expect(bridge).toContain(getPrimeAgentExtensionPath());
		expect(bridge).toContain('"SUPERSET_HOOK_VERSION":"2"');
		expect(run("").stdout.trim().split("\n")).toEqual([
			"--resume",
			"session-1",
		]);
		expect(
			run("terminal-1", ["sessions", "--all"]).stdout.trim().split("\n"),
		).toEqual(["sessions", "--all"]);
	});

	it("launches without the bridge when the real binary has no --extension flag", () => {
		const hooksBefore = readdirSync(path.join(home, "hooks")).sort();
		const result = spawnSync(
			path.join(home, "bin", "prime-agent"),
			["--resume", "session-1"],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: "terminal-1",
					SUPERSET_AGENT_ID: "",
					PRIME_TEST_NO_EXTENSION: "1",
					PATH: `${path.join(home, "bin")}:${path.join(home, "real-bin")}:${process.env.PATH}`,
				},
			},
		);
		expect(result.status).toBe(0);
		expect(result.stdout.trim().split("\n")).toEqual(["--resume", "session-1"]);
		expect(readdirSync(path.join(home, "hooks")).sort()).toEqual(hooksBefore);
	});

	it("reports working and idle through the sessions watcher when --extension is missing", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "prime-watch-"));
		const state = path.join(dir, "sessions.json");
		const events = path.join(dir, "events.jsonl");
		const notify = path.join(home, "hooks", "notify.sh");
		writeFileSync(
			notify,
			`#!/bin/bash\nprintf "%s\\n" "$1" >> ${JSON.stringify(events)}\n`,
			{ mode: 0o755 },
		);
		chmodSync(notify, 0o755);
		const fakeBin = path.join(dir, "bin");
		mkdirSync(fakeBin);
		const session = (activity: string) =>
			JSON.stringify({
				sessions: [
					{
						sessionId: "s-1",
						cwd: dir,
						activity,
						attachedClients: 1,
						modified: activity,
					},
				],
			});
		writeFileSync(
			path.join(fakeBin, "prime-agent"),
			`#!/bin/bash
case "$1" in
  --help) echo "  --model <id>"; exit 0 ;;
  sessions) cat ${JSON.stringify(state)} 2>/dev/null || echo '{"sessions":[]}'; exit 0 ;;
esac
sleep 0.6
printf '%s' ${JSON.stringify(session("working"))} > ${JSON.stringify(state)}
sleep 0.8
printf '%s' ${JSON.stringify(session("idle"))} > ${JSON.stringify(state)}
sleep 0.8
exit 3
`,
			{ mode: 0o755 },
		);
		const result = spawnSync(path.join(home, "bin", "prime-agent"), [], {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				SUPERSET_HOME_DIR: home,
				SUPERSET_TERMINAL_ID: "terminal-1",
				SUPERSET_AGENT_ID: "",
				SUPERSET_PRIME_WATCH_POLL_MS: "100",
				PATH: `${path.join(home, "bin")}:${fakeBin}:${process.env.PATH}`,
			},
		});
		expect(result.status).toBe(3);
		const names = readFileSync(events, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((event) => event.session_id === "s-1")
			.map((event) => event.hook_event_name);
		expect(names).toEqual(["SessionStart", "Start", "Stop", "SessionEnd"]);
		rmSync(notify, { force: true });
		rmSync(dir, { recursive: true, force: true });
	});

	function writeFakeSendBinary(dir: string, main: string): string {
		const fakeBin = path.join(dir, "bin");
		mkdirSync(fakeBin);
		writeFileSync(
			path.join(fakeBin, "prime-agent"),
			`#!/bin/bash
case "$1" in
  --help) echo "  --model <id>"; exit 0 ;;
  sessions) cat ${JSON.stringify(path.join(dir, "sessions.json"))} 2>/dev/null || echo '{"sessions":[]}'; exit 0 ;;
  send) printf '%s|%s\\n' "$2" "$3" >> ${JSON.stringify(path.join(dir, "sends"))}; exit 0 ;;
esac
printf '%s\\n' "$@" > ${JSON.stringify(path.join(dir, "argv"))}
${main}
`,
			{ mode: 0o755 },
		);
		return fakeBin;
	}

	function runWithTerminal(dir: string, fakeBin: string, args: string[]) {
		return spawnSync(path.join(home, "bin", "prime-agent"), args, {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				TMPDIR: dir,
				SUPERSET_HOME_DIR: home,
				SUPERSET_TERMINAL_ID: "terminal-1",
				SUPERSET_AGENT_ID: "",
				SUPERSET_PRIME_WATCH_POLL_MS: "100",
				PATH: `${path.join(home, "bin")}:${fakeBin}:${process.env.PATH}`,
			},
		});
	}

	it("sends the launch message once with prime send instead of passing it to the TUI", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "prime-prompt-"));
		const draft = JSON.stringify({
			sessions: [
				{
					id: "d-1",
					sessionId: "s-1",
					cwd: dir,
					messageCount: 0,
					created: "CREATED",
				},
			],
		});
		const fakeBin = writeFakeSendBinary(
			dir,
			`printf '%s' ${JSON.stringify(draft)} | sed "s/CREATED/$(date -u +%Y-%m-%dT%H:%M:%SZ)/" > ${JSON.stringify(path.join(dir, "sessions.json"))}
sleep 1.2`,
		);
		const result = runWithTerminal(dir, fakeBin, [
			"--model",
			"m",
			"Hello there",
		]);
		expect(result.status).toBe(0);
		expect(readFileSync(path.join(dir, "argv"), "utf8")).toBe("--model\nm\n");
		expect(readFileSync(path.join(dir, "sends"), "utf8")).toBe(
			"d-1|Hello there\n",
		);
		expect(
			readdirSync(dir).filter((name) =>
				name.startsWith("superset-prime-prompt."),
			),
		).toEqual([]);
		rmSync(dir, { recursive: true, force: true });
	});

	it("keeps a launch message it could not send and says where it is", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "prime-prompt-"));
		const fakeBin = writeFakeSendBinary(dir, "exit 0");
		const result = runWithTerminal(dir, fakeBin, ["Hello there"]);
		expect(result.status).toBe(0);
		expect(readFileSync(path.join(dir, "argv"), "utf8")).toBe("\n");
		const saved = result.stderr.match(/saved in (\S+)/)?.[1];
		expect(saved && readFileSync(saved, "utf8")).toBe("Hello there");
		expect(existsSync(path.join(dir, "sends"))).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});

	it("reaps unused bridges on repeated resumes and failed launches without touching loaded bridges", () => {
		const before = readdirSync(path.join(home, "hooks")).sort();
		for (const exitCode of [0, 0, 17]) {
			const result = spawnSync(
				path.join(home, "bin", "prime-agent"),
				["--resume", "session-1"],
				{
					encoding: "utf8",
					env: {
						...process.env,
						SUPERSET_TERMINAL_ID: "terminal-1",
						SUPERSET_AGENT_ID: "",
						PRIME_TEST_REUSE: "1",
						PRIME_TEST_EXIT_CODE: String(exitCode),
						PATH: `${path.join(home, "bin")}:${path.join(home, "real-bin")}:${process.env.PATH}`,
					},
				},
			);
			expect(result.status).toBe(exitCode);
			const args = result.stdout.trim().split("\n");
			expect(args).toEqual([
				"--extension",
				expect.any(String),
				"--resume",
				"session-1",
			]);
			expect(existsSync(path.dirname(args[1] ?? ""))).toBe(false);
			expect(readdirSync(path.join(home, "hooks")).sort()).toEqual(before);
			expect(existsSync(bridgePath)).toBe(true);
			expect(existsSync(`${bridgePath}.loaded`)).toBe(true);
		}
	});

	it("reports attach, working, completed, and detach with the resumable session id", () => {
		const notify = path.join(home, "hooks", "notify.sh");
		const events = path.join(home, "events.jsonl");
		writeFileSync(
			notify,
			`#!/bin/bash\nprintf "%s\\n" "$1" >> ${JSON.stringify(events)}\n`,
			{ mode: 0o755 },
		);
		chmodSync(notify, 0o755);
		const script = `import extension from ${JSON.stringify(bridgePath)};
const handlers = {};
extension({ on(name, handler) { handlers[name] = handler; }, registerTool() {} });
const ctx = { sessionManager: { getSessionId: () => "session-uuid" } };
for (const name of ["session_start", "agent_start", "agent_end", "session_shutdown"]) handlers[name](name === "agent_end" ? { messages: [] } : {}, ctx);`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_HOME_DIR: home,
					SUPERSET_TERMINAL_ID: "",
					SUPERSET_AGENT_ID: "",
					PRIME_TEST_EVENTS: events,
				},
			},
		);
		expect(result.status).toBe(0);
		expect(
			readFileSync(events, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line)),
		).toEqual(
			["SessionStart", "Start", "Stop", "SessionEnd"].map(
				(hook_event_name) => ({ hook_event_name, session_id: "session-uuid" }),
			),
		);
	});

	it("shows attention only while the question dialog is pending", () => {
		const events = path.join(home, "events.jsonl");
		writeFileSync(events, "");
		const script = `import extension from ${JSON.stringify(bridgePath)};
import { readFileSync } from "node:fs";
const handlers = {};
let tool;
extension({ on(name, handler) { handlers[name] = handler; }, registerTool(value) { tool = value; } });
let answer;
let opened;
const dialogOpened = new Promise((resolve) => { opened = resolve; });
let timerFired;
const attentionSent = new Promise((resolve) => { timerFired = resolve; });
const ctx = {
  hasUI: true,
  setTimeout(callback) { return setTimeout(async () => { await callback(); timerFired(); }, 0); },
  clearTimeout(timer) { clearTimeout(timer); },
  sessionManager: { getSessionId: () => "session-uuid" },
  ui: { input() { opened(); return new Promise((resolve) => { answer = resolve; }); } },
};
await handlers.agent_start({}, ctx);
const pending = tool.execute("call-1", { question: "Which option?" }, undefined, undefined, ctx);
await dialogOpened;
await attentionSent;
const during = readFileSync(${JSON.stringify(events)}, "utf8").trim().split("\\n").map(JSON.parse).map((event) => event.hook_event_name);
answer("Option A");
const result = await pending;
ctx.ui.input = async () => undefined;
const cancelled = await tool.execute("call-2", { question: "Still waiting?" }, undefined, undefined, ctx);
await handlers.agent_end({ messages: [{ role: "assistant", stopReason: "stop" }] }, ctx);
const after = readFileSync(${JSON.stringify(events)}, "utf8").trim().split("\\n").map(JSON.parse).map((event) => event.hook_event_name);
console.log(JSON.stringify({ name: tool.name, during, after, result, cancelled }));`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: "",
					SUPERSET_AGENT_ID: "",
				},
			},
		);
		expect(result.status).toBe(0);
		const output = JSON.parse(result.stdout.trim());
		expect(output.name).toBe("superset_ask_user");
		expect(output.during).toEqual(["Start", "PermissionRequest"]);
		expect(output.after).toEqual([
			"Start",
			"PermissionRequest",
			"Start",
			"Stop",
		]);
		expect(output.result.content).toEqual([{ type: "text", text: "Option A" }]);
		expect(output.cancelled.content).toEqual([
			{ type: "text", text: "User cancelled the question." },
		]);
	});

	it("reports a final model error as Failed, not Stop", () => {
		const events = path.join(home, "events.jsonl");
		writeFileSync(events, "");
		const script = `import extension from ${JSON.stringify(bridgePath)};
import { readFileSync } from "node:fs";
const handlers = {};
extension({ on(name, handler) { handlers[name] = handler; }, registerTool() {} });
const ctx = { sessionManager: { getSessionId: () => "session-uuid" } };
await handlers.agent_start({}, ctx);
await handlers.agent_end({ messages: [{ role: "assistant", stopReason: "error", errorMessage: "Provider unavailable" }] }, ctx);
console.log(JSON.stringify(readFileSync(${JSON.stringify(events)}, "utf8").trim().split("\\n").map(JSON.parse).map((event) => event.hook_event_name)));`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: {
					...process.env,
					SUPERSET_TERMINAL_ID: "",
					SUPERSET_AGENT_ID: "",
				},
			},
		);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toEqual(["Start", "Failed"]);
	});

	it("still loads when the loaded marker cannot be written", () => {
		const script = `import extension from ${JSON.stringify(getPrimeAgentExtensionPath())};
const registered = [];
extension({ on(name) { registered.push(name); }, registerTool(tool) { registered.push(tool.name); } }, {
  SUPERSET_TERMINAL_ID: "terminal-1",
  SUPERSET_HOME_DIR: ${JSON.stringify(home)},
  SUPERSET_PRIME_BRIDGE_PATH: ${JSON.stringify(path.join(home, "missing", "bridge.mjs"))},
});
console.log(JSON.stringify(registered));`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{ encoding: "utf8", env: process.env },
		);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toContain("superset_ask_user");
	});

	it("revokes loaded hooks, queued events, and input when the extension is removed", () => {
		const events = path.join(home, "events.jsonl");
		writeFileSync(events, "");
		const script = `import extension from ${JSON.stringify(bridgePath)};
import { rmSync } from "node:fs";
const handlers = {};
let tool;
extension({ on(name, handler) { handlers[name] = handler; }, registerTool(value) { tool = value; } });
const ctx = {
  hasUI: true,
  sessionManager: { getSessionId: () => "session-uuid" },
  ui: { input() { throw new Error("Disabled integration opened input"); } },
};
const queued = handlers.agent_start({}, ctx);
rmSync(${JSON.stringify(getPrimeAgentExtensionPath())});
await queued;
await handlers.agent_end({ messages: [] }, ctx);
const result = await tool.execute("call-1", { question: "Continue?" }, undefined, undefined, ctx);
await handlers.session_shutdown({ reason: "quit" }, ctx);
console.log(JSON.stringify(result));`;
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", script],
			{
				encoding: "utf8",
				env: process.env,
			},
		);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout).content[0].text).toContain(
			"Interactive input is unavailable",
		);
		expect(readFileSync(events, "utf8")).toBe("");
		expect(existsSync(bridgePath)).toBe(false);
		expect(existsSync(path.dirname(bridgePath))).toBe(false);
	});

	it("tears down idempotently, preserves user files, and can be re-enabled", () => {
		createPrimeAgentExtension();
		const unrelated = path.join(home, "hooks", "user-extension.mjs");
		writeFileSync(unrelated, "user extension");
		expect(teardownSingleAgent("prime-agent")).toBe(true);
		expect(existsSync(getPrimeAgentExtensionPath())).toBe(false);
		expect(teardownSingleAgent("prime-agent")).toBe(true);
		expect(readFileSync(unrelated, "utf8")).toBe("user extension");
		const run = () =>
			spawnSync(
				path.join(home, "bin", "prime-agent"),
				["--resume", "session-1"],
				{
					encoding: "utf8",
					env: {
						...process.env,
						SUPERSET_TERMINAL_ID: "terminal-1",
						SUPERSET_AGENT_ID: "",
						PATH: `${path.join(home, "bin")}:${path.join(home, "real-bin")}:${process.env.PATH}`,
					},
				},
			);
		const disabled = run();
		expect(disabled.status).toBe(0);
		expect(disabled.stdout.trim().split("\n")).toEqual([
			"--resume",
			"session-1",
		]);
		writeFileSync(getPrimeAgentExtensionPath(), "user-owned replacement");
		teardownSingleAgent("prime-agent");
		expect(readFileSync(getPrimeAgentExtensionPath(), "utf8")).toBe(
			"user-owned replacement",
		);
		rmSync(getPrimeAgentExtensionPath());
		createPrimeAgentExtension();
		const enabled = run();
		expect(enabled.status).toBe(0);
		expect(enabled.stdout.trim().split("\n")[0]).toBe("--extension");
	});
});
