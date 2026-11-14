import { afterEach, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
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
