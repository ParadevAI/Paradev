import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readlinkSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	claudeProjectDirName,
	linkClaudeProjectsAfterHomeMove,
} from "./claude-project-links";

let root: string;
let projectsDir: string;
const legacyHomeDir = "/Users/me/.superset";
const homeDir = "/Users/me/.paradev";

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "claude-links-"));
	projectsDir = path.join(root, "projects");
	mkdirSync(projectsDir);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

function addProject(worktreePath: string): string {
	const name = claudeProjectDirName(worktreePath);
	mkdirSync(path.join(projectsDir, name));
	return name;
}

describe("linkClaudeProjectsAfterHomeMove", () => {
	it("links each old worktree project under its new name", () => {
		const worktree = addProject(`${legacyHomeDir}/worktrees/app/main`);
		const subdir = addProject(`${legacyHomeDir}/worktrees/app/main/apps/web`);
		const session = addProject(`${legacyHomeDir}/sessions/scratch`);
		addProject("/Users/me/code/app");
		addProject(`${legacyHomeDir}/worktrees/${"x".repeat(220)}`);

		const linked = linkClaudeProjectsAfterHomeMove({
			legacyHomeDir,
			homeDir,
			claudeConfigDirs: [root],
		});

		expect(linked).toBe(3);
		for (const [oldName, newPath] of [
			[worktree, `${homeDir}/worktrees/app/main`],
			[subdir, `${homeDir}/worktrees/app/main/apps/web`],
			[session, `${homeDir}/sessions/scratch`],
		]) {
			const link = path.join(projectsDir, claudeProjectDirName(newPath));
			expect(readlinkSync(link)).toBe(oldName);
		}
		expect(readdirSync(projectsDir)).toHaveLength(8);
	});

	it("leaves a project that already exists under the new name", () => {
		addProject(`${legacyHomeDir}/worktrees/app/main`);
		const current = addProject(`${homeDir}/worktrees/app/main`);

		expect(
			linkClaudeProjectsAfterHomeMove({
				legacyHomeDir,
				homeDir,
				claudeConfigDirs: [root],
			}),
		).toBe(0);
		expect(existsSync(path.join(projectsDir, current))).toBe(true);
	});
});
