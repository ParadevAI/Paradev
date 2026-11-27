import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit as simpleGit } from "../../runtime/git/simple-git";
import { captureWorktreeState, restoreWorktreeState } from "./checkpoints";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

test("a fork preserves staged, unstaged and untracked changes without changing its source", async () => {
	const dir = await mkdtemp(join(tmpdir(), "paradev-fork-test-"));
	dirs.push(dir);
	const source = join(dir, "source");
	await mkdir(source);
	const repo = simpleGit(source, {
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	});
	await repo.init();
	await repo.addConfig("commit.gpgsign", "false");
	await repo.addConfig("core.hooksPath", join(dir, "no-hooks"));
	await repo.addConfig("user.name", "Test");
	await repo.addConfig("user.email", "test@example.com");
	await writeFile(join(source, "file.txt"), "committed\n");
	await writeFile(join(source, ".gitignore"), "ignored\n");
	await repo.add(".");
	await repo.commit("initial");
	await writeFile(join(source, "file.txt"), "staged\n");
	await repo.add("file.txt");
	await writeFile(join(source, "file.txt"), "unstaged\n");
	await writeFile(join(source, "new file.txt"), "new\n");
	await writeFile(join(source, "binary.bin"), Buffer.from([0, 255, 1]));
	await writeFile(join(source, "ignored"), "not copied");
	await writeFile(join(source, "intent[1].txt"), "intent-to-add\n");
	await repo.raw(["add", "-N", "--", "intent[1].txt"]);
	const head = await repo.revparse(["HEAD"]);
	const index = await readFile(join(source, ".git/index"));
	const status = await repo.raw(["status", "--porcelain=v1", "-uall"]);
	const snapshot = await captureWorktreeState(source);
	const fork = join(dir, "fork");
	await repo.raw(["worktree", "add", "-b", "fork", fork, snapshot.head]);
	await restoreWorktreeState(fork, snapshot);
	expect(await simpleGit(fork).revparse(["HEAD"])).toBe(head);
	expect(await simpleGit(fork).raw(["status", "--porcelain=v1", "-uall"])).toBe(
		status,
	);
	expect(await readFile(join(fork, "file.txt"), "utf8")).toBe("unstaged\n");
	expect(await simpleGit(fork).show([":file.txt"])).toBe("staged\n");
	expect(await readFile(join(fork, "binary.bin"))).toEqual(
		Buffer.from([0, 255, 1]),
	);
	expect(await Bun.file(join(fork, "ignored")).exists()).toBe(false);
	expect(await repo.revparse(["HEAD"])).toBe(head);
	expect(await readFile(join(source, ".git/index"))).toEqual(index);
	expect(await repo.raw(["status", "--porcelain=v1", "-uall"])).toBe(status);
});
