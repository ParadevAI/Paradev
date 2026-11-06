import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createClaudeSettingsJson,
	createCodexHooksJson,
	getClaudeGlobalSettingsJsonPath,
	getCodexGlobalHooksJsonPath,
} from "./agent-wrappers-claude-codex-opencode";
import {
	getManagedNotifyHookCommand,
	MANAGED_NOTIFY_COMMAND_LABEL,
} from "./agent-wrappers-common";
import {
	createDevinConfigJson,
	getDevinConfigJsonPath,
} from "./agent-wrappers-devin";
import {
	createGeminiSettingsJson,
	getGeminiSettingsJsonPath,
} from "./agent-wrappers-gemini";
import { createManagedSkills } from "./managed-skills";

const ORIGINAL_ENV = {
	HOME: process.env.HOME,
	PATH: process.env.PATH,
	SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR,
	XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};
let root: string;

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-json-hooks-"));
	process.env.HOME = path.join(root, "home");
	process.env.SUPERSET_HOME_DIR = path.join(root, "app-home");
	process.env.XDG_CONFIG_HOME = path.join(root, "home", ".config");
	process.env.PATH = path.join(root, "empty-bin");
});

afterEach(() => {
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	fs.rmSync(root, { recursive: true, force: true });
});

function readDevinHooks(): Record<
	string,
	Array<{ hooks: { command: string }[] }>
> {
	return JSON.parse(fs.readFileSync(getDevinConfigJsonPath(), "utf-8")).hooks;
}

describe("ensureManagedJsonHooks", () => {
	it("creates nothing for an agent that is not installed", () => {
		const wrapperDir = path.join(root, "app-home", "bin");
		fs.mkdirSync(wrapperDir, { recursive: true });
		fs.writeFileSync(path.join(wrapperDir, "devin"), "#!/bin/sh\n", {
			mode: 0o755,
		});
		process.env.PATH = wrapperDir;

		createDevinConfigJson();

		expect(fs.existsSync(path.dirname(getDevinConfigJsonPath()))).toBe(false);
	});

	it("stays absent across boots although Paradev's own files create the config dirs", async () => {
		const home = path.join(root, "home");
		const boot = async () => {
			await createManagedSkills({ homeDir: home, pluginSources: [] });
			fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
			fs.writeFileSync(path.join(home, ".codex", "config.toml"), "");
			createClaudeSettingsJson();
			createCodexHooksJson();
		};

		await boot();
		await boot();

		expect(fs.existsSync(path.join(home, ".claude", "skills"))).toBe(true);
		expect(fs.existsSync(getClaudeGlobalSettingsJsonPath())).toBe(false);
		expect(fs.existsSync(getCodexGlobalHooksJsonPath())).toBe(false);
	});

	it("counts a path only the agent creates as installed", () => {
		fs.mkdirSync(path.join(root, "home", ".claude", "projects"), {
			recursive: true,
		});

		createClaudeSettingsJson();

		expect(fs.existsSync(getClaudeGlobalSettingsJsonPath())).toBe(true);
	});

	it("does not take a directory another agent shares as proof of install", () => {
		fs.mkdirSync(path.join(root, "home", ".gemini", "config"), {
			recursive: true,
		});

		createGeminiSettingsJson();

		expect(fs.existsSync(getGeminiSettingsJsonPath())).toBe(false);
	});

	it("writes the config when the agent binary is on PATH", () => {
		const bin = path.join(root, "usr-bin");
		fs.mkdirSync(bin, { recursive: true });
		fs.writeFileSync(path.join(bin, "devin"), "#!/bin/sh\n", { mode: 0o755 });
		process.env.PATH = bin;

		createDevinConfigJson();

		expect(Object.keys(readDevinHooks())).toContain("SessionStart");
	});

	it("replaces an unlabeled managed command with the labeled one and keeps user hooks", () => {
		const legacyCommand = getManagedNotifyHookCommand("devin").replace(
			`${MANAGED_NOTIFY_COMMAND_LABEL} `,
			"",
		);
		const userHook = { hooks: [{ type: "command", command: "echo mine" }] };
		fs.mkdirSync(path.dirname(getDevinConfigJsonPath()), { recursive: true });
		fs.writeFileSync(
			getDevinConfigJsonPath(),
			JSON.stringify({
				version: 1,
				hooks: {
					Stop: [
						userHook,
						{ hooks: [{ type: "command", command: legacyCommand }] },
					],
				},
			}),
		);

		createDevinConfigJson();

		const stop = readDevinHooks().Stop ?? [];
		expect(stop).toEqual([
			userHook,
			{
				hooks: [
					{ type: "command", command: getManagedNotifyHookCommand("devin") },
				],
			},
		]);
		expect(stop[1]?.hooks[0]?.command.startsWith(": paradev-notify; ")).toBe(
			true,
		);
	});
});
