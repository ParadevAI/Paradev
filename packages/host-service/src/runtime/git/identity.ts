// Git/GitHub identity reads. Worker-safe: no DB or event-bus imports, so
// the git/readGitIdentity worker task can bundle this module.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { detectGit } from "@superset/shared/detect-git";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "./simple-git";

const execFileAsync = promisify(execFile);

export interface ResolvedGitInfo {
	githubUsername: string | null;
	authorName: string | null;
}

/** Reads `user.name` from git config. Returns null when unset or unreadable. */
export async function getGitAuthorName(git: SimpleGit): Promise<string | null> {
	try {
		const name = await git.getConfig("user.name");
		return name.value?.trim() || null;
	} catch (error) {
		console.warn("[git-identity] failed to read git user.name:", error);
		return null;
	}
}

/**
 * Resolves the authenticated GitHub username via `gh api user`, relying on
 * the user's existing `gh auth login` session. Null on any failure
 * (gh missing, not authenticated, network).
 */
export async function getGitHubUsernameViaGh(
	shellEnv: Record<string, string>,
): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"gh",
			["api", "user", "--jq", ".login"],
			{ encoding: "utf8", timeout: 10_000, env: shellEnv },
		);
		return stdout.trim() || null;
	} catch (error) {
		console.warn("[git-identity] failed to read GitHub username:", error);
		return null;
	}
}

/**
 * False on a Mac without Command Line Tools, where running /usr/bin/git opens
 * Apple's install dialog.
 */
export async function gitCanRun(
	shellEnv: Record<string, string>,
): Promise<boolean> {
	const git = await detectGit({
		platform: process.platform,
		run: async (command, args) =>
			(
				await execFileAsync(command, args, {
					encoding: "utf8",
					timeout: 5_000,
					env: shellEnv,
				})
			).stdout,
		fileExists: existsSync,
	});
	return git.installed;
}

/**
 * Git identity used to preview `author`/`github` branch prefixes in settings.
 * `shellEnv` is only for the `gh` and detection spawns; the git config read
 * keeps the process env — simple-git rejects env containing GIT_EDITOR as
 * unsafe.
 *
 * The config read is anchored at the home directory rather than left to
 * simple-git's default of the process working directory: this runs in a
 * worker, and a worker must not depend on where the host was launched — that
 * directory can be deleted while the host runs (HOST-SERVICE-5D), and which
 * repository it happened to be would otherwise decide whose name a global
 * setting previews.
 */
export async function readGitIdentity(
	shellEnv: Record<string, string>,
	{
		canRunGit = gitCanRun,
		readAuthorName = () => getGitAuthorName(createUserSimpleGit(homedir())),
	}: {
		canRunGit?: (shellEnv: Record<string, string>) => Promise<boolean>;
		readAuthorName?: () => Promise<string | null>;
	} = {},
): Promise<ResolvedGitInfo> {
	const [githubUsername, authorName] = await Promise.all([
		getGitHubUsernameViaGh(shellEnv),
		canRunGit(shellEnv).then((ok) => (ok ? readAuthorName() : null)),
	]);
	return { githubUsername, authorName };
}
