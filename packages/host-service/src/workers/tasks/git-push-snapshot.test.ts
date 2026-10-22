import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { gitPushSnapshotTask } from "./git.ts";

describe("gitPushSnapshotTask", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "push-snapshot-"));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("pushes uncommitted and untracked work without changing the worktree", async () => {
		const remotePath = join(root, "remote.git");
		const repoPath = join(root, "repo");
		await simpleGit().init(["--bare", remotePath]);
		await simpleGit().clone(remotePath, repoPath);
		const git = simpleGit(repoPath);
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await writeFile(join(repoPath, "tracked.txt"), "committed\n");
		await git.add("tracked.txt");
		await git.commit("initial");
		const head = (await git.revparse(["HEAD"])).trim();
		await writeFile(join(repoPath, "tracked.txt"), "edited\n");
		await writeFile(join(repoPath, "new.txt"), "untracked\n");
		const statusBefore = await git.raw(["status", "--porcelain"]);

		const { commit, remoteUrl } = await gitPushSnapshotTask.handler({
			worktreePath: repoPath,
			branch: "superset/teleport-test",
			gitEnv: {},
		});

		expect(remoteUrl).toBe(remotePath);
		expect((await git.revparse(["HEAD"])).trim()).toBe(head);
		expect(await git.raw(["status", "--porcelain"])).toBe(statusBefore);
		expect(await readFile(join(repoPath, "tracked.txt"), "utf8")).toBe(
			"edited\n",
		);
		const remote = simpleGit(remotePath);
		expect(
			(await remote.revparse(["refs/heads/superset/teleport-test"])).trim(),
		).toBe(commit);
		expect(await remote.show([`${commit}:tracked.txt`])).toBe("edited\n");
		expect(await remote.show([`${commit}:new.txt`])).toBe("untracked\n");
		expect((await remote.raw(["rev-parse", `${commit}^`])).trim()).toBe(head);
	});
});
