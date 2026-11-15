import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getManagedNotifyHookCommand } from "./agent-wrappers-common";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function setup() {
	const root = mkdtempSync(path.join(tmpdir(), "claude-wrapper-"));
	roots.push(root);
	const appHome = path.join(root, "paradev home");
	const bin = path.join(root, "real-bin");
	const profile = path.join(root, "alternate profile");
	for (const dir of [
		bin,
		profile,
		path.join(appHome, "bin"),
		path.join(appHome, "hooks"),
	]) {
		mkdirSync(dir, { recursive: true });
	}
	const settings = JSON.stringify({
		model: "alternate-model",
		env: { REGION: "alternate" },
	});
	writeFileSync(path.join(profile, "settings.json"), settings);
	writeFileSync(
		path.join(bin, "claude"),
		'#!/bin/bash\nprintf "%s\\0" "$CLAUDE_CONFIG_DIR" "$@"\n',
		{ mode: 0o755 },
	);
	const created = Bun.spawnSync(
		[
			process.execPath,
			"-e",
			`import { createClaudeWrapper } from ${JSON.stringify(path.join(import.meta.dir, "agent-wrappers-claude-codex-opencode.ts"))}; createClaudeWrapper();`,
		],
		{
			env: { ...process.env, SUPERSET_HOME_DIR: appHome },
		},
	);
	expect(created.exitCode).toBe(0);
	const run = (args: string[], terminalId = "terminal-test") => {
		const result = Bun.spawnSync(
			["/bin/bash", path.join(appHome, "bin", "claude"), ...args],
			{
				env: {
					...process.env,
					PATH: `${bin}:/usr/bin:/bin`,
					BASH_ENV: "",
					SUPERSET_HOME_DIR: appHome,
					SUPERSET_TERMINAL_ID: terminalId,
					SUPERSET_AGENT_ID: "",
					CLAUDE_CONFIG_DIR: profile,
				},
			},
		);
		expect(result.exitCode).toBe(0);
		const [configDir, ...forwarded] = result.stdout
			.toString()
			.split("\0")
			.slice(0, -1);
		expect(configDir).toBe(profile);
		expect(readFileSync(path.join(profile, "settings.json"), "utf8")).toBe(
			settings,
		);
		return forwarded;
	};
	return { run, appHome, profile };
}

test("loads only managed hooks when Claude uses an exported config directory", () => {
	const { run } = setup();
	const args = run(["-p", "Reply with PONG"]);
	expect(args[0]).toBe("--settings");
	expect(args.slice(2)).toEqual(["-p", "Reply with PONG"]);
	const settings = JSON.parse(readFileSync(args[1] ?? "", "utf8"));
	expect(Object.keys(settings)).toEqual(["hooks"]);
	expect(settings.hooks.Stop).toEqual([
		{
			hooks: [
				{ type: "command", command: getManagedNotifyHookCommand("claude") },
			],
		},
	]);
});

test.each([
	false,
	true,
])("preserves explicit settings (equals form: %s)", (equals) => {
	const { run, profile } = setup();
	const settings = path.join(profile, "caller settings.json");
	const args = [
		...(equals ? [`--settings=${settings}`] : ["--settings", settings]),
		"-p",
		"Reply with PONG",
	];
	const forwarded = run(args);
	expect(forwarded[0]).toBe("--settings");
	expect(forwarded.slice(2)).toEqual(args);
});

test("preserves prompt text after --", () => {
	const { run } = setup();
	const args = run(["--", "--settings"]);
	expect(args[0]).toBe("--settings");
	expect(args.slice(2)).toEqual(["--", "--settings"]);
});

test("leaves launches outside Paradev unchanged", () => {
	const { run } = setup();
	expect(run(["-p", "Reply with PONG"], "")).toEqual(["-p", "Reply with PONG"]);
});

test("keeps Claude runnable when the generated hook settings are absent", () => {
	const { run, appHome } = setup();
	rmSync(path.join(appHome, "hooks", "claude-settings.json"));
	expect(run(["-p", "Reply with PONG"])).toEqual(["-p", "Reply with PONG"]);
});
