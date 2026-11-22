import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { gitFetchBaseRefTask, gitFetchBranchesTask } from "./git.ts";

const gitEnv = {
	PATH: process.env.PATH ?? "",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};

describe("fetch worker tasks", () => {
	let root: string;
	let repoPath: string;
	let capturedEnvPath: string;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "background-fetch-"));
		repoPath = join(root, "repo");
		capturedEnvPath = join(root, "gcm-interactive.txt");
		const fakeSsh = join(root, "fake-ssh.sh");
		await writeFile(
			fakeSsh,
			`#!/bin/sh\nprintf '%s' "$GCM_INTERACTIVE" > '${capturedEnvPath}'\nexit 1\n`,
		);
		chmodSync(fakeSsh, 0o755);
		await simpleGit().init([repoPath]);
		const git = simpleGit(repoPath, {
			unsafe: { allowUnsafeSshCommand: true },
		});
		await git.raw(["remote", "add", "origin", "ssh://example.invalid/r.git"]);
		await git.raw(["config", "core.sshCommand", fakeSsh]);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const fetches = {
		"base branch": (interactive: boolean) =>
			gitFetchBaseRefTask.handler({
				worktreePath: repoPath,
				target: { remote: "origin", branch: "main" },
				gitEnv,
				interactive,
			}),
		branches: (interactive: boolean) =>
			gitFetchBranchesTask.handler({
				worktreePath: repoPath,
				branches: ["main"],
				missingOnly: false,
				gitEnv,
				interactive,
			}),
	};

	for (const [name, fetch] of Object.entries(fetches)) {
		test(`a non-interactive ${name} fetch tells Git Credential Manager not to prompt`, async () => {
			await expect(fetch(false)).rejects.toThrow();
			expect(await readFile(capturedEnvPath, "utf8")).toBe("never");

			await expect(fetch(true)).rejects.toThrow();
			expect(await readFile(capturedEnvPath, "utf8")).toBe("");
		});
	}
});
