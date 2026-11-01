import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setupAgentCapabilities } from "./agent-setup";
import { defaultBinarySearchDirs, isAgentInstalled } from "./installed-agents";

const ORIGINAL = {
	HOME: process.env.HOME,
	PATH: process.env.PATH,
	SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR,
};
let home: string;

beforeEach(() => {
	home = fs.mkdtempSync(path.join(os.tmpdir(), "superset-installed-"));
	process.env.HOME = home;
	process.env.PATH = path.join(home, "empty-bin");
	process.env.SUPERSET_HOME_DIR = path.join(home, ".superset");
});

afterEach(() => {
	for (const [key, value] of Object.entries(ORIGINAL)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	fs.rmSync(home, { recursive: true, force: true });
});

describe("isAgentInstalled", () => {
	it("is false on a bare home", () => {
		expect(isAgentInstalled("claude", [])).toBe(false);
	});

	it("detects a config dir", () => {
		fs.mkdirSync(path.join(home, ".codex"));
		expect(isAgentInstalled("codex", [])).toBe(true);
	});

	it("detects a binary in a search dir", () => {
		const bin = path.join(home, "bin");
		fs.mkdirSync(bin);
		fs.writeFileSync(path.join(bin, "gemini"), "#!/bin/sh\n", { mode: 0o755 });
		expect(isAgentInstalled("gemini", [bin])).toBe(true);
	});

	it("leaves Superset's own wrapper dir out of the search", () => {
		const wrappers = path.join(home, ".superset", "bin");
		process.env.PATH = wrappers;
		expect(defaultBinarySearchDirs()).not.toContain(wrappers);
	});
});

describe("setupAgentCapabilities with skipUninstalledAgents", () => {
	it("writes only the installed agent's config", () => {
		fs.mkdirSync(path.join(home, ".superset", "hooks"), { recursive: true });
		fs.mkdirSync(path.join(home, ".superset", "bin"), { recursive: true });
		setupAgentCapabilities({
			skipUninstalledAgents: true,
			isInstalled: (id) => id === "claude",
		});

		expect(fs.existsSync(path.join(home, ".claude", "settings.json"))).toBe(
			true,
		);
		for (const dir of [".codex", ".cursor", ".gemini", ".grok", ".factory"]) {
			expect(fs.existsSync(path.join(home, dir))).toBe(false);
		}
	});
});
