import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { gitFetchBaseRefTask } from "./git.ts";

let root = "";

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

test("a non-interactive base-branch fetch tells Git Credential Manager not to prompt", async () => {
	root = mkdtempSync(join(tmpdir(), "fetch-base-ref-"));
	const repoPath = join(root, "repo");
	const capturedEnvPath = join(root, "gcm-interactive.txt");
	const fakeSsh = join(root, "fake-ssh.sh");
	await writeFile(
		fakeSsh,
		`#!/bin/sh\nprintf '%s' "$GCM_INTERACTIVE" > '${capturedEnvPath}'\nexit 1\n`,
	);
	chmodSync(fakeSsh, 0o755);
	await simpleGit().init([repoPath]);
	const git = simpleGit(repoPath, { unsafe: { allowUnsafeSshCommand: true } });
	await git.raw(["remote", "add", "origin", "ssh://example.invalid/r.git"]);
	await git.raw(["config", "core.sshCommand", fakeSsh]);

	await expect(
		gitFetchBaseRefTask.handler({
			worktreePath: repoPath,
			target: { remote: "origin", branch: "main" },
			gitEnv: {
				PATH: process.env.PATH ?? "",
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
			},
			interactive: false,
		}),
	).rejects.toThrow();

	expect(await readFile(capturedEnvPath, "utf8")).toBe("never");
});
