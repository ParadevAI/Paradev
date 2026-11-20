import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { gitWorktreeStateTask } from "./git.ts";

const gitEnv = {
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};

describe("gitWorktreeStateTask", () => {
	let repoPath: string;

	beforeEach(async () => {
		repoPath = mkdtempSync(join(tmpdir(), "worktree-state-"));
		const git = simpleGit(repoPath);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		writeFileSync(join(repoPath, ".gitignore"), "node_modules/\n");
		writeFileSync(join(repoPath, "tracked.txt"), "committed\n");
		await git.add([".gitignore", "tracked.txt"]);
		await git.commit("initial");
	});

	afterEach(() => {
		rmSync(repoPath, { recursive: true, force: true });
	});

	const readState = () =>
		gitWorktreeStateTask.handler({ worktreePath: repoPath, gitEnv });

	test("ignored files do not make the worktree dirty", async () => {
		mkdirSync(join(repoPath, "node_modules", "pkg"), { recursive: true });
		writeFileSync(join(repoPath, "node_modules", "pkg", "index.js"), "x");
		expect((await readState()).hasChanges).toBe(false);
	});

	test("a file deep inside an untracked directory makes the worktree dirty", async () => {
		mkdirSync(join(repoPath, "generated", "a", "b"), { recursive: true });
		writeFileSync(join(repoPath, "generated", "a", "b", "out.js"), "x");
		expect((await readState()).hasChanges).toBe(true);
	});

	test("a modified tracked file makes the worktree dirty", async () => {
		writeFileSync(join(repoPath, "tracked.txt"), "edited\n");
		expect((await readState()).hasChanges).toBe(true);
	});
});
