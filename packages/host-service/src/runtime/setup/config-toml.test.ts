import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultTerminal } from "@superset/shared/project-config";
import {
	chainPhases,
	describeProjectConfigSources,
	hasProjectConfig,
	invalidConfigCommand,
	type LegacyConfigSource,
	loadProjectConfig,
} from "./config";

let root: string;
let repoPath: string;
let worktreePath: string;
let homeDir: string;
const projectId = "proj-1";

function write(dir: string, name: string, content: string) {
	mkdirSync(join(dir, ".superset"), { recursive: true });
	writeFileSync(join(dir, ".superset", name), content, "utf-8");
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "config-toml-test-"));
	repoPath = join(root, "repo");
	worktreePath = join(root, "worktree");
	homeDir = join(root, "home");
	for (const dir of [repoPath, worktreePath, homeDir]) {
		mkdirSync(dir, { recursive: true });
	}
	delete process.env.SUPERSET_HOST_RUN_MODE;
	delete process.env.IS_SANDBOX;
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	delete process.env.SUPERSET_HOST_RUN_MODE;
	delete process.env.IS_SANDBOX;
});

const args = () => ({ repoPath, projectId, worktreePath, homeDir });

type LoadArgs =
	| ReturnType<typeof args>
	| { repoPath: string; projectId: string };

function resolved(loadArgs: LoadArgs = args()) {
	const config = loadProjectConfig(loadArgs);
	if (config?.kind !== "ok") throw new Error("expected a valid config");
	return config.resolved;
}

function setupCommand(loadArgs: LoadArgs = args()) {
	const config = resolved(loadArgs);
	return chainPhases([config.install, config.setup], worktreePath);
}

describe("loadProjectConfig with config.toml", () => {
	it("setup runs install then setup", () => {
		write(
			worktreePath,
			"config.toml",
			'[install]\nrun = "bun install"\n[setup]\nrun = ["./setup.sh"]\n',
		);
		expect(setupCommand()).toEqual({ command: "bun install && ./setup.sh" });
	});

	it("archive is its own section, and Run is the first default terminal", () => {
		write(
			worktreePath,
			"config.toml",
			'[archive]\nrun = ["./archive.sh"]\n[terminals.docs]\nrun = "bun docs"\n[terminals.dev]\nrun = "bun dev"\ndefault = true\ncwd = "apps/web"\n',
		);
		expect(resolved().archive.commands).toEqual(["./archive.sh"]);
		expect(getDefaultTerminal(resolved())).toMatchObject({
			commands: ["bun dev"],
			cwd: "apps/web",
		});
	});

	it("wins over config.json and ignores the .sh fallback", () => {
		write(repoPath, "config.json", JSON.stringify({ setup: ["old"] }));
		write(repoPath, "teardown.sh", "echo old");
		write(worktreePath, "config.toml", '[setup]\nrun = "new"\n');
		expect(resolved().setup.commands).toEqual(["new"]);
		expect(resolved().archive.commands).toEqual([]);
	});

	it("falls back to the main checkout's config.toml", () => {
		write(repoPath, "config.toml", '[setup]\nrun = "from-main"\n');
		expect(resolved().setup.commands).toEqual(["from-main"]);
	});

	it("reads config.local.toml from the main checkout only", () => {
		write(worktreePath, "config.toml", '[setup]\nrun = "shared"\n');
		write(repoPath, "config.local.toml", '[setup]\nrun = ["shared", "mine"]\n');
		write(worktreePath, "config.local.toml", '[setup]\nrun = "ignored"\n');
		expect(resolved().setup.commands).toEqual(["shared", "mine"]);
	});

	it("different cwds give each command its own directory", () => {
		write(
			worktreePath,
			"config.toml",
			'[install]\nrun = "bun install"\n[setup]\nrun = "./setup.sh"\ncwd = "apps/web"\n',
		);
		expect(setupCommand()).toEqual({
			command: `(cd '${worktreePath}' && bun install) && (cd '${join(worktreePath, "apps/web")}' && ./setup.sh)`,
		});
	});

	it("the cloud reads the cloud tables, without the personal file", () => {
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		write(
			repoPath,
			"config.toml",
			'[setup]\nrun = "local-setup"\n[setup.cloud]\nrun = "cloud-setup"\n',
		);
		write(repoPath, "config.local.toml", '[setup]\nrun = "personal"\n');
		expect(resolved({ repoPath, projectId }).setup.commands).toEqual([
			"cloud-setup",
		]);
	});

	it("a local app launched from a sandbox terminal still resolves as local", () => {
		process.env.IS_SANDBOX = "1";
		write(
			repoPath,
			"config.toml",
			'[terminals.dev]\nrun = "local-dev"\ndefault = true\n[terminals.dev.cloud]\nrun = "cloud-dev"\n',
		);
		expect(
			getDefaultTerminal(resolved({ repoPath, projectId }))?.commands,
		).toEqual(["local-dev"]);
	});

	it("an invalid file reports its errors, and setup prints them and fails", () => {
		write(worktreePath, "config.toml", '[setup]\nrun = "x"\ndefualt = 1\n');
		const config = loadProjectConfig(args());
		expect(config?.kind).toBe("invalid");
		if (config?.kind !== "invalid") return;
		const command = invalidConfigCommand(config);
		expect(command).toContain("defualt");
		expect(command.endsWith("&& false")).toBe(true);
	});
});

describe("loadProjectConfig with v1 in the cloud", () => {
	it("keeps v1's cloud behavior: only start runs, and no teardown", () => {
		process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
		write(
			repoPath,
			"config.json",
			JSON.stringify({ setup: ["local"], teardown: ["down"], run: ["dev"] }),
		);
		const config = resolved({ repoPath, projectId });
		expect(config.setup.commands).toEqual([]);
		expect(config.archive.commands).toEqual([]);
		expect(getDefaultTerminal(config)).toBeNull();
	});
});

describe("hasProjectConfig and describeProjectConfigSources", () => {
	it("a config.toml counts as configured and reports no legacy sources", () => {
		write(repoPath, "config.toml", "");
		expect(hasProjectConfig({ repoPath, projectId, homeDir })).toBe(true);
		expect(describeProjectConfigSources(args())).toEqual({
			format: "toml",
			legacySources: [],
		});
	});

	it("reports the v1 features in use", () => {
		write(
			repoPath,
			"config.json",
			JSON.stringify({ setup: ["a"], start: ["b"] }),
		);
		write(
			repoPath,
			"config.local.json",
			JSON.stringify({ setup: { after: ["c"] } }),
		);
		write(repoPath, "teardown.sh", "echo");
		const userDir = join(homeDir, ".superset", "projects", projectId);
		mkdirSync(userDir, { recursive: true });
		writeFileSync(join(userDir, "config.json"), "{}");
		const expected: LegacyConfigSource[] = [
			"before_after",
			"cloud_start",
			"config_json",
			"config_local_json",
			"script_fallback",
			"user_projects_override",
		];
		expect(describeProjectConfigSources(args()).legacySources.sort()).toEqual(
			expected.sort(),
		);
	});

	it("nothing configured reports none", () => {
		expect(describeProjectConfigSources(args()).format).toBe("none");
		expect(hasProjectConfig({ repoPath, projectId, homeDir })).toBe(false);
	});
});
