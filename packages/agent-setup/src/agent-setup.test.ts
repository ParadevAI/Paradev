import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { syncSkillGatedHooks } from "./agent-setup";

const ISOLATED_ENV_KEYS = [
	"HOME",
	"SUPERSET_HOME_DIR",
	"SUPERSET_DISABLED_SKILLS",
	"SUPERSET_DISABLED_AGENT_HOOKS",
] as const;
const ORIGINAL_ENV = ISOLATED_ENV_KEYS.map(
	(key) => [key, process.env[key]] as const,
);

let root: string;

function claudeSettingsPath(): string {
	return path.join(root, "home", ".claude", "settings.json");
}

function artifactGuardCount(): number {
	const settings = JSON.parse(readFileSync(claudeSettingsPath(), "utf-8")) as {
		hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
	};
	return (settings.hooks.PreToolUse ?? []).filter((entry) =>
		entry.hooks.some((hook) => hook.command.includes("artifact-guard.sh")),
	).length;
}

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "superset-agent-setup-"));
	process.env.HOME = path.join(root, "home");
	process.env.SUPERSET_HOME_DIR = path.join(root, "superset");
	delete process.env.SUPERSET_DISABLED_SKILLS;
	delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
});

afterEach(() => {
	for (const [key, value] of ORIGINAL_ENV) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(root, { recursive: true, force: true });
});

describe("syncSkillGatedHooks", () => {
	it("adds and removes Claude's Artifact guard as the page skill is toggled", () => {
		syncSkillGatedHooks({ disabledAgentIds: [], disabledSkillIds: [] });
		expect(artifactGuardCount()).toBe(1);

		syncSkillGatedHooks({ disabledAgentIds: [], disabledSkillIds: ["page"] });
		expect(artifactGuardCount()).toBe(0);

		syncSkillGatedHooks({ disabledAgentIds: [], disabledSkillIds: [] });
		expect(artifactGuardCount()).toBe(1);
	});

	it("leaves Claude's settings alone while its hooks are disabled", () => {
		syncSkillGatedHooks({ disabledAgentIds: ["claude"], disabledSkillIds: [] });
		expect(existsSync(claudeSettingsPath())).toBe(false);
	});
});
