import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { gitPushSnapshotTask, gitSnapshotRemoteTask } from "./git.ts";

const NO_GLOBAL_CONFIG = {
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};

describe("gitPushSnapshotTask", () => {
	let root: string;
	let remotePath: string;
	let repoPath: string;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "push-snapshot-"));
		remotePath = join(root, "remote.git");
		repoPath = join(root, "repo");
		await simpleGit().init(["--bare", remotePath]);
		await simpleGit().clone(remotePath, repoPath);
		const git = simpleGit(repoPath);
		await git.raw(["config", "user.email", "test@example.com"]);
		await git.raw(["config", "user.name", "test"]);
		await git.raw(["config", "commit.gpgsign", "false"]);
		await writeFile(join(repoPath, "tracked.txt"), "committed\n");
		await git.add("tracked.txt");
		await git.commit("initial");
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("finds the remote and the URL it pushes to", async () => {
		await simpleGit(repoPath).raw([
			"remote",
			"set-url",
			"--push",
			"origin",
			join(root, "push.git"),
		]);
		expect(
			await gitSnapshotRemoteTask.handler({
				worktreePath: repoPath,
				gitEnv: {},
			}),
		).toEqual({ remote: "origin", pushUrls: [join(root, "push.git")] });
	});

	test("uses the first remote when there is no origin, with every push URL", async () => {
		const git = simpleGit(repoPath);
		await git.raw(["remote", "rename", "origin", "upstream"]);
		await git.raw([
			"remote",
			"set-url",
			"--add",
			"--push",
			"upstream",
			"a.git",
		]);
		await git.raw([
			"remote",
			"set-url",
			"--add",
			"--push",
			"upstream",
			"b.git",
		]);
		expect(
			await gitSnapshotRemoteTask.handler({
				worktreePath: repoPath,
				gitEnv: {},
			}),
		).toEqual({ remote: "upstream", pushUrls: ["a.git", "b.git"] });
	});

	test("finds no remote in a repository without one", async () => {
		await simpleGit(repoPath).raw(["remote", "remove", "origin"]);
		expect(
			await gitSnapshotRemoteTask.handler({
				worktreePath: repoPath,
				gitEnv: {},
			}),
		).toBeNull();
	});

	test("pushes uncommitted and untracked work without changing the worktree", async () => {
		const git = simpleGit(repoPath);
		const head = (await git.revparse(["HEAD"])).trim();
		await writeFile(join(repoPath, "tracked.txt"), "edited\n");
		await writeFile(join(repoPath, "new.txt"), "untracked\n");
		const statusBefore = await git.raw(["status", "--porcelain"]);

		const { commit } = await gitPushSnapshotTask.handler({
			worktreePath: repoPath,
			remote: "origin",
			branch: "superset/teleport-test",
			gitEnv: {},
		});

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

	test("pushes HEAD itself when nothing changed", async () => {
		const head = (await simpleGit(repoPath).revparse(["HEAD"])).trim();
		const { commit } = await gitPushSnapshotTask.handler({
			worktreePath: repoPath,
			remote: "origin",
			branch: "superset/teleport-clean",
			gitEnv: {},
		});
		expect(commit).toBe(head);
		expect(
			(
				await simpleGit(remotePath).revparse([
					"refs/heads/superset/teleport-clean",
				])
			).trim(),
		).toBe(head);
	});

	test("commits the snapshot when git has no identity for the user", async () => {
		const git = simpleGit(repoPath);
		await git.raw(["config", "--unset", "user.email"]);
		await git.raw(["config", "--unset", "user.name"]);
		await git.raw(["config", "user.useConfigOnly", "true"]);
		await writeFile(join(repoPath, "tracked.txt"), "edited\n");

		const { commit } = await gitPushSnapshotTask.handler({
			worktreePath: repoPath,
			remote: "origin",
			branch: "superset/teleport-anon",
			gitEnv: NO_GLOBAL_CONFIG,
		});
		const remote = simpleGit(remotePath);
		expect(await remote.show([`${commit}:tracked.txt`])).toBe("edited\n");
		expect(
			(await remote.raw(["log", "-1", "--format=%an <%ae>", commit])).trim(),
		).toBe("Superset <teleport@superset.sh>");
	});
});
