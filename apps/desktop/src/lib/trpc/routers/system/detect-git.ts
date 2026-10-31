import { join } from "node:path";

export interface GitDetectResult {
	installed: boolean;
	version: string | null;
	needsCommandLineTools: boolean;
	error: string | null;
}

export interface DetectGitDeps {
	platform: NodeJS.Platform;
	/** Resolves with stdout; rejects when the command fails or is missing. */
	run: (command: string, args: string[]) => Promise<string>;
	fileExists: (path: string) => boolean;
}

const APPLE_GIT_STUB_PATH = "/usr/bin/git";

const NEEDS_COMMAND_LINE_TOOLS: GitDetectResult = {
	installed: false,
	version: null,
	needsCommandLineTools: true,
	error: null,
};

async function runOrNull(
	run: DetectGitDeps["run"],
	command: string,
	args: string[],
): Promise<string | null> {
	try {
		return (await run(command, args)).trim() || null;
	} catch {
		return null;
	}
}

function failureReason(error: unknown): string | null {
	if (error && typeof error === "object" && "code" in error) {
		if (error.code === "ENOENT") return null;
	}
	const stderr =
		error && typeof error === "object" && "stderr" in error
			? String(error.stderr)
			: "";
	const text = stderr.trim() || (error instanceof Error ? error.message : "");
	return text.split("\n")[0]?.trim() || null;
}

export async function detectGit({
	platform,
	run,
	fileExists,
}: DetectGitDeps): Promise<GitDetectResult> {
	if (platform === "darwin") {
		// Running Apple's /usr/bin/git stub without developer tools opens the
		// "install command line developer tools" prompt, so check them first.
		const gitPath = await runOrNull(run, "/usr/bin/which", ["git"]);
		if (gitPath === null || gitPath === APPLE_GIT_STUB_PATH) {
			const developerDir = await runOrNull(run, "/usr/bin/xcode-select", [
				"-p",
			]);
			if (
				developerDir === null ||
				!fileExists(join(developerDir, "usr", "bin", "git"))
			) {
				return NEEDS_COMMAND_LINE_TOOLS;
			}
		}
	}

	try {
		const stdout = await run("git", ["--version"]);
		return {
			installed: true,
			version: stdout.match(/git version (\S+)/)?.[1] ?? null,
			needsCommandLineTools: false,
			error: null,
		};
	} catch (error) {
		return {
			installed: false,
			version: null,
			needsCommandLineTools: false,
			error: failureReason(error),
		};
	}
}
