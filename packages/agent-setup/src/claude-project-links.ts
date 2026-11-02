import fs from "node:fs";
import path from "node:path";
import { resolveUserHomeDir } from "./paths";

/**
 * Claude Code names a session's project directory after its working directory
 * (resolved through symlinks, NFC-normalized) with every non-alphanumeric
 * UTF-16 code unit replaced by `-`, and past 200 characters truncates it and
 * appends a hash of the full path.
 */
const PROJECT_DIR_MAX_LENGTH = 200;

function projectPathHash(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export function claudeProjectDirName(worktreePath: string): string {
	const normalized = worktreePath.normalize("NFC").replace(/(?<=.)[\\/]+$/, "");
	const encoded = normalized.replaceAll(/[^a-zA-Z0-9]/g, "-");
	if (encoded.length <= PROJECT_DIR_MAX_LENGTH) return encoded;
	return `${encoded.slice(0, PROJECT_DIR_MAX_LENGTH)}-${projectPathHash(normalized)}`;
}

/**
 * After the app home moves, a worktree's real path changes, and Claude Code
 * files its sessions under a new project directory. Links each old directory
 * under its new name so `/resume` and `--continue` in an existing workspace
 * still list sessions from before the move. Covers every Claude config dir:
 * `~/.claude`, `CLAUDE_CONFIG_DIR` entries and the per-account dirs kept in
 * hidden folders under home or `~/.config`; only dirs whose `projects/` holds
 * old worktree entries are touched. Names Claude already hashed cannot be
 * mapped and are skipped.
 */
export function linkClaudeProjectsAfterHomeMove(args: {
	legacyHomeDir: string;
	homeDir: string;
	claudeConfigDirs?: string[];
}): number {
	const renames = ["worktrees", "sessions"].map((dir) => ({
		from: claudeProjectDirName(path.join(args.legacyHomeDir, dir)),
		to: claudeProjectDirName(path.join(args.homeDir, dir)),
	}));
	let linked = 0;
	for (const configDir of args.claudeConfigDirs ??
		claudeConfigDirCandidates()) {
		linked += linkProjects(path.join(configDir, "projects"), renames);
	}
	return linked;
}

function linkProjects(
	projectsDir: string,
	renames: Array<{ from: string; to: string }>,
): number {
	let entries: string[];
	try {
		entries = fs.readdirSync(projectsDir);
	} catch {
		return 0;
	}
	let linked = 0;
	for (const entry of entries) {
		if (entry.length > PROJECT_DIR_MAX_LENGTH) continue;
		const rename = renames.find(({ from }) => entry.startsWith(`${from}-`));
		if (!rename) continue;
		const target = rename.to + entry.slice(rename.from.length);
		if (target.length > PROJECT_DIR_MAX_LENGTH) continue;
		try {
			fs.symlinkSync(entry, path.join(projectsDir, target), "dir");
			linked++;
		} catch {}
	}
	return linked;
}

function claudeConfigDirCandidates(): string[] {
	const home = resolveUserHomeDir();
	const hiddenDirs = (dir: string) => {
		try {
			return fs
				.readdirSync(dir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && entry.name.startsWith("."))
				.map((entry) => path.join(dir, entry.name));
		} catch {
			return [];
		}
	};
	const configDirs = (() => {
		try {
			return fs
				.readdirSync(path.join(home, ".config"), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.join(home, ".config", entry.name));
		} catch {
			return [];
		}
	})();
	const fromEnv = (process.env.CLAUDE_CONFIG_DIR ?? "")
		.split(",")
		.map((dir) => dir.trim())
		.filter(Boolean);
	return [...new Set([...fromEnv, ...hiddenDirs(home), ...configDirs])];
}
