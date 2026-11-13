import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { gitRouter } from "./git";
import { getGitStatusSnapshot } from "./utils/git-status";
import { checkoutStatusKey, gitStatusStore } from "./utils/git-status-store";
import { seedTestCheckout, testGitContext } from "./utils/test-checkout";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

for (const action of ["stageFile", "unstageFile"] as const) {
	test(`${action} refreshes cached status before any watcher notification`, async () => {
		const repo = await mkdtemp(join(tmpdir(), "staging-status-"));
		roots.push(repo);
		const git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
		await writeFile(join(repo, "tracked.txt"), "original\n");
		await git.add(".");
		await git.commit("initial");
		await writeFile(join(repo, "tracked.txt"), "changed\n");
		if (action === "unstageFile") await git.add(".");

		const workspaceId = `staging-status-${action}`;
		const { db, repositoryId } = seedTestCheckout({
			workspaceId,
			worktreePath: repo,
		});
		const caller = gitRouter.createCaller(testGitContext(db));
		const statusKey = checkoutStatusKey(workspaceId, repositoryId);
		let fullReads = 0;
		const read = () =>
			gitStatusStore.read({
				workspaceId: statusKey,
				baseBranch: null,
				computeFull: async () => {
					fullReads++;
					return (await getGitStatusSnapshot({ git, worktreePath: repo }))
						.snapshot;
				},
				computePartial: async () => {
					throw new Error("mutation must invalidate in full");
				},
			});
		gitStatusStore.attach(statusKey);
		try {
			await read();
			await read();
			expect(fullReads).toBe(1);
			await caller[action]({ workspaceId, filePath: "tracked.txt" });
			const result = await read();
			expect(fullReads).toBe(2);
			expect(result.staged.map((file) => file.path)).toEqual(
				action === "stageFile" ? ["tracked.txt"] : [],
			);
			expect(result.unstaged.map((file) => file.path)).toEqual(
				action === "unstageFile" ? ["tracked.txt"] : [],
			);
		} finally {
			gitStatusStore.drop(statusKey);
		}
	}, 30_000);
}
