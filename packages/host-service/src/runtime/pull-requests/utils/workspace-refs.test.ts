import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { readWorkspaceRefs } from "./workspace-refs";

test("pull refs keep their tracking remote and ordinary branches keep their namespace", async () => {
	const path = mkdtempSync(join(tmpdir(), "paradev-pull-ref-"));
	try {
		const git = simpleGit(path);
		await git.raw(["init", "--initial-branch=fixture"]);
		await git.raw([
			"-c",
			"user.name=Fixture",
			"-c",
			"user.email=fixture@example.invalid",
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"-m",
			"initial",
		]);
		await git.addRemote("origin", "https://github.com/base/project.git");
		await git.addRemote("fork", "https://github.com/fork/project.git");
		await git.raw(["config", "remote.pushDefault", "fork"]);
		await git.raw(["config", "branch.fixture.remote", "origin"]);
		await git.raw(["config", "branch.fixture.merge", "refs/pull/42/head"]);
		expect((await readWorkspaceRefs(git)).upstream).toEqual({
			owner: "base",
			name: "project",
			branch: "refs/pull/42/head",
		});

		await git.raw([
			"config",
			"branch.fixture.merge",
			"refs/heads/refs/pull/42/head",
		]);
		const ordinary = (await readWorkspaceRefs(git)).upstream;
		expect(ordinary).toEqual({
			owner: "fork",
			name: "project",
			branch: "refs/heads/refs/pull/42/head",
		});
	} finally {
		rmSync(path, { recursive: true, force: true });
	}
});
