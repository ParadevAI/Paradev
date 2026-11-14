import { afterEach, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	createGitFixture,
	type GitFixture,
} from "../../../../../test/helpers/git-fixture";
import { copyWorktree } from "./move-worktree";

let fixture: GitFixture | undefined;

afterEach(() => {
	if (fixture) {
		rmSync(`${fixture.repoPath}-from`, { recursive: true, force: true });
		rmSync(`${fixture.repoPath}-to`, { recursive: true, force: true });
		fixture.dispose();
	}
	fixture = undefined;
});

test("a worktree copied to another folder is the same worktree there", async () => {
	fixture = await createGitFixture();
	const from = `${fixture.repoPath}-from`;
	const to = `${fixture.repoPath}-to`;
	await fixture.git.raw(["worktree", "add", "-b", "feature", from]);

	await copyWorktree(fixture.git, from, to);

	expect(existsSync(from)).toBe(false);
	const list = await fixture.git.raw(["worktree", "list", "--porcelain"]);
	expect(list).toContain(`worktree ${to}\n`);
	expect(list).not.toContain(`worktree ${from}\n`);
	const head = Bun.spawnSync(["git", "branch", "--show-current"], { cwd: to });
	expect(head.stdout.toString().trim()).toBe("feature");
});

test("a copy whose old folder cannot be removed still counts as moved", async () => {
	fixture = await createGitFixture();
	const from = `${fixture.repoPath}-from`;
	const to = `${fixture.repoPath}-to`;
	await fixture.git.raw(["worktree", "add", "-b", "feature", from]);

	await copyWorktree(fixture.git, from, to, async () => {
		throw new Error("EBUSY");
	});

	expect(existsSync(from)).toBe(true);
	const list = await fixture.git.raw(["worktree", "list", "--porcelain"]);
	expect(list).toContain(`worktree ${to}\n`);
});

test("a copy that fails part way leaves nothing at the new folder", async () => {
	fixture = await createGitFixture();
	const from = `${fixture.repoPath}-from`;
	const to = `${fixture.repoPath}-to`;
	await fixture.git.raw(["worktree", "add", "-b", "feature", from]);
	const unreadable = join(from, "secret.txt");
	writeFileSync(unreadable, "x");
	chmodSync(unreadable, 0);

	try {
		await expect(copyWorktree(fixture.git, from, to)).rejects.toThrow();
	} finally {
		chmodSync(unreadable, 0o644);
	}

	expect(existsSync(to)).toBe(false);
	expect(existsSync(from)).toBe(true);
});

test("a copy onto a folder that exists is refused and leaves that folder", async () => {
	fixture = await createGitFixture();
	const from = `${fixture.repoPath}-from`;
	const to = `${fixture.repoPath}-to`;
	await fixture.git.raw(["worktree", "add", "-b", "feature", from]);
	mkdirSync(to);
	writeFileSync(join(to, "mine.txt"), "mine");

	await expect(copyWorktree(fixture.git, from, to)).rejects.toThrow(
		"already exists",
	);

	expect(existsSync(join(to, "mine.txt"))).toBe(true);
});
