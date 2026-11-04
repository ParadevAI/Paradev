import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../runtime/git/simple-git";
import { listGitWorktrees } from "../../trpc/router/workspace-creation/shared/worktree-list";
import { detectExternalWorktrees } from "./external-worktrees";
import type { ExternalWorktreeSource } from "./sources";

const home = realpathSync(mkdtempSync(join(tmpdir(), "external-worktrees-")));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const SOURCES: ExternalWorktreeSource[] = [
	{
		id: "conductor",
		homeDir: "tool",
		roots: [{ path: "tool/workspaces", maxDepth: 2 }],
	},
];

async function initRepo(path: string) {
	mkdirSync(path, { recursive: true });
	const git = createUserSimpleGit(path);
	await git.init(["--initial-branch=main"]);
	await git.raw([
		"-c",
		"user.name=t",
		"-c",
		"user.email=t@t",
		"commit",
		"--allow-empty",
		"-m",
		"init",
	]);
	return git;
}

const listWorktrees = (repoPath: string) =>
	listGitWorktrees(createUserSimpleGit(repoPath));

describe("detectExternalWorktrees", () => {
	it("finds branch worktrees of the user's repos and skips detached, tool-owned, and tracked ones", async () => {
		const repo = join(home, "code/app");
		const git = await initRepo(repo);
		const feature = join(home, "tool/workspaces/app/feature");
		const tracked = join(home, "tool/workspaces/app/tracked");
		const detached = join(home, "tool/workspaces/app/detached");
		await git.raw(["worktree", "add", "-b", "feature", feature]);
		await git.raw(["worktree", "add", "-b", "tracked", tracked]);
		await git.raw(["worktree", "add", "--detach", detached]);

		const clone = join(home, "tool/clones/owned");
		const cloneGit = await initRepo(clone);
		await cloneGit.raw([
			"worktree",
			"add",
			"-b",
			"x",
			join(home, "tool/workspaces/owned-x"),
		]);

		const repos = await detectExternalWorktrees({
			homeDir: home,
			sources: SOURCES,
			listWorktrees,
			trackedWorktreePaths: new Set([tracked]),
		});

		expect(repos).toEqual([
			{
				repoPath: repo,
				name: "app",
				worktrees: [{ path: feature, branch: "feature", source: "conductor" }],
			},
		]);
	});
});
