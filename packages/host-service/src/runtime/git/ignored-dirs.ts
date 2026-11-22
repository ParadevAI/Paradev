import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveCommand } from "@superset/shared/resolve-command";
import { DEFAULT_IGNORE_DIR_NAMES } from "@superset/workspace-fs/ignore-defaults";

const execFileAsync = promisify(execFile);

// Bounds the non-generated remainder for a pathological repo (thousands of
// ignored entries). Dirs named like generated output (node_modules, build,
// dist, …) are never capped: they are the subtrees that must not be watched,
// and a monorepo can have more of them than any fixed cap.
const MAX_OTHER_IGNORED_DIRS = 200;
const TIMEOUT_MS = 3_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Worktree-relative directories that git ignores entirely, straight from
 * `git ls-files --others --ignored --exclude-standard --directory`. Asking
 * git (instead of parsing .gitignore) keeps the answer authoritative across
 * nested .gitignore files, `.git/info/exclude`, and the global excludesfile.
 *
 * Only collapsed `dir/` entries are returned: `--directory` collapses a
 * directory to one entry only when nothing inside it is tracked, so pruning
 * these subtrees can never hide a tracked file's changes. Individual ignored
 * files (e.g. `.env`) are deliberately excluded — files stay watched so an
 * open gitignored file still live-reloads.
 *
 * `under` limits the listing to those root-relative dirs, matched literally.
 *
 * Returns [] when the root is not a git worktree or does not exist. Every
 * other failure (a timeout under attach load, a corrupt index) rejects, so
 * callers can tell "git ignores nothing here" from "git did not answer".
 */
export async function listGitIgnoredDirs(
	rootPath: string,
	under?: readonly string[],
): Promise<string[]> {
	try {
		const { stdout } = await execFileAsync(
			resolveCommand("git"),
			[
				"--literal-pathspecs",
				"-C",
				rootPath,
				"ls-files",
				"--others",
				"--ignored",
				"--exclude-standard",
				"--directory",
				"-z",
				...(under ? ["--", ...under] : []),
			],
			{
				timeout: TIMEOUT_MS,
				maxBuffer: MAX_BUFFER_BYTES,
				// isNotAWorktree matches git's untranslated messages.
				env: { ...process.env, LC_ALL: "C" },
			},
		);
		const dirs: string[] = [];
		let others = 0;
		for (const entry of stdout.split("\0")) {
			if (!entry.endsWith("/")) continue;
			const dir = entry.slice(0, -1);
			const name = dir.slice(dir.lastIndexOf("/") + 1);
			if (!DEFAULT_IGNORE_DIR_NAMES.has(name)) {
				if (others >= MAX_OTHER_IGNORED_DIRS) continue;
				others += 1;
			}
			dirs.push(dir);
		}
		return dirs;
	} catch (error) {
		if (isNotAWorktree(error)) return [];
		throw error;
	}
}

function isNotAWorktree(error: unknown): boolean {
	const stderr = String((error as { stderr?: unknown } | null)?.stderr ?? "");
	return (
		stderr.includes("not a git repository") ||
		stderr.includes("cannot change to")
	);
}
