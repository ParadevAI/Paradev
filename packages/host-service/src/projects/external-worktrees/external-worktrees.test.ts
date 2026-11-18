import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../runtime/git/simple-git";
import { listGitWorktrees } from "../../trpc/router/workspace-creation/shared/worktree-list";
import { detectExternalWorktrees } from "./external-worktrees";
import type { ExternalWorktreeSource } from "./sources";

const homes: string[] = [];
afterAll(() => {
	for (const dir of homes) rmSync(dir, { recursive: true, force: true });
});
function makeHome(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "external-worktrees-")));
	homes.push(dir);
	return dir;
}

const SOURCES: ExternalWorktreeSource[] = [
	{
		id: "conductor",
		toolOwnedDirs: ["tool/clones"],
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
		const home = makeHome();
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

		const userRepoInToolDir = join(home, "tool/repos/lib");
		const libGit = await initRepo(userRepoInToolDir);
		const libFeature = join(home, "tool/workspaces/lib/feature");
		await libGit.raw(["worktree", "add", "-b", "feature", libFeature]);

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
			{
				repoPath: userRepoInToolDir,
				name: "lib",
				worktrees: [
					{ path: libFeature, branch: "feature", source: "conductor" },
				],
			},
		]);
	});

	it("returns nothing when the roots are missing or hold no worktrees", async () => {
		const home = makeHome();
		mkdirSync(join(home, "tool/workspaces/empty"), { recursive: true });

		const repos = await detectExternalWorktrees({
			homeDir: home,
			sources: [
				...SOURCES,
				{
					id: "orca",
					toolOwnedDirs: [],
					roots: [{ path: "missing/workspaces", maxDepth: 2 }],
				},
			],
			listWorktrees,
		});

		expect(repos).toEqual([]);
	});

	it("skips a repository whose worktree list fails and keeps the others", async () => {
		const home = makeHome();
		const good = join(home, "code/good");
		const bad = join(home, "code/bad");
		const goodGit = await initRepo(good);
		const badGit = await initRepo(bad);
		const goodFeature = join(home, "tool/workspaces/good/feature");
		await goodGit.raw(["worktree", "add", "-b", "feature", goodFeature]);
		await badGit.raw([
			"worktree",
			"add",
			"-b",
			"feature",
			join(home, "tool/workspaces/bad/feature"),
		]);

		const repos = await detectExternalWorktrees({
			homeDir: home,
			sources: SOURCES,
			listWorktrees: async (repoPath) => {
				if (repoPath === bad) throw new Error("git failed");
				return listWorktrees(repoPath);
			},
		});

		expect(repos.map((repo) => repo.repoPath)).toEqual([good]);
	});
});
