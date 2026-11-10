import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type SimpleGit, simpleGit } from "simple-git";
import { projects, workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { createTestDb } from "../pull-requests/shared/test-db";
import { gitRouter, worktreeHoldingBranch } from "./git";

function createCaller(worktreePath: string) {
	const db = createTestDb();
	db.insert(projects).values({ id: "project", repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({
			id: "ws",
			projectId: "project",
			worktreePath,
			branch: "main",
			createdAt: 1,
			updatedAt: 1,
			lastActivityAt: 1,
		})
		.run();
	const ctx = {
		isAuthenticated: true,
		db,
		eventBus: { emit: () => {}, broadcastWorkspaceChanged: () => {} },
		git: async (path: string) => simpleGit(path),
	} as unknown as HostServiceContext;
	return {
		caller: gitRouter.createCaller(ctx),
		branchOfRow: () =>
			db.select().from(workspaces).where(eq(workspaces.id, "ws")).get()?.branch,
	};
}

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

let root: string;
let repo: string;
let git: SimpleGit;

beforeEach(async () => {
	root = mkdtempSync(join(tmpdir(), "superset-checkout-"));
	repo = join(root, "worktree");
	await mkdir(repo);
	git = await initRepo(repo);
	await writeFile(join(repo, "a.txt"), "one\n");
	await git.raw(["add", "--", "a.txt"]);
	await git.raw(["commit", "-m", "init"]);
	await git.raw(["branch", "layer-2"]);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

test("a clean workspace switches to the branch and the row follows", async () => {
	const { caller, branchOfRow } = createCaller(repo);
	const result = await caller.checkoutBranch({
		workspaceId: "ws",
		branch: "layer-2",
	});
	expect(result).toEqual({ branch: "layer-2" });
	expect((await git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe("layer-2");
	expect(branchOfRow()).toBe("layer-2");
});

test("a dirty workspace is refused and stays where it was", async () => {
	await writeFile(join(repo, "a.txt"), "edited\n");
	await expect(
		createCaller(repo).caller.checkoutBranch({
			workspaceId: "ws",
			branch: "layer-2",
		}),
	).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	expect((await git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe("main");
});

test("a branch another worktree holds is refused with a conflict", async () => {
	await git.raw(["worktree", "add", join(root, "other"), "layer-2"]);
	await expect(
		createCaller(repo).caller.checkoutBranch({
			workspaceId: "ws",
			branch: "layer-2",
		}),
	).rejects.toMatchObject({ code: "CONFLICT" });
});

test("worktreeHoldingBranch reads the porcelain listing", () => {
	const porcelain = [
		"worktree /repo\nHEAD abc\nbranch refs/heads/main\n",
		"worktree /repo/.wt/two\nHEAD def\nbranch refs/heads/layer-2\n",
		"worktree /repo/.wt/detached\nHEAD 123\ndetached\n",
	].join("\n");
	expect(worktreeHoldingBranch(porcelain, "layer-2")).toBe("/repo/.wt/two");
	expect(worktreeHoldingBranch(porcelain, "layer-3")).toBeNull();
});

test("fetchBranches with missingOnly leaves known branches alone", async () => {
	const result = await createCaller(repo).caller.fetchBranches({
		workspaceId: "ws",
		branches: ["layer-2"],
		missingOnly: true,
	});
	expect(result).toEqual({ fetched: [] });
});
