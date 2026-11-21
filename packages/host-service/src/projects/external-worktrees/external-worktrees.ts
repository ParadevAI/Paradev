import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
	normalizeWorktreePath,
	type WorktreeRecord,
} from "../../trpc/router/workspace-creation/shared/worktree-list";
import type {
	ExternalWorktreeSource,
	ExternalWorktreeSourceId,
} from "./sources";

export interface ExternalWorktree {
	path: string;
	branch: string;
	source: ExternalWorktreeSourceId;
}

export interface ExternalWorktreeRepo {
	repoPath: string;
	name: string;
	worktrees: ExternalWorktree[];
}

export interface DetectExternalWorktreesOptions {
	homeDir: string;
	sources: readonly ExternalWorktreeSource[];
	listWorktrees: (repoPath: string) => Promise<WorktreeRecord[]>;
	trackedWorktreePaths?: ReadonlySet<string>;
	maxEntriesPerRoot?: number;
}

const SKIPPED_DIR_NAMES = new Set(["node_modules", ".git"]);
const DEFAULT_MAX_ENTRIES_PER_ROOT = 5000;

export async function detectExternalWorktrees({
	homeDir,
	sources,
	listWorktrees,
	trackedWorktreePaths = new Set(),
	maxEntriesPerRoot = DEFAULT_MAX_ENTRIES_PER_ROOT,
}: DetectExternalWorktreesOptions): Promise<ExternalWorktreeRepo[]> {
	const roots = sources.flatMap((source) =>
		source.roots.map((root) => ({
			source: source.id,
			path: normalizeWorktreePath(join(homeDir, root.path)),
			maxDepth: root.maxDepth,
		})),
	);
	const toolOwnedPrefixes = sources.flatMap((source) =>
		source.toolOwnedDirs.map((dir) =>
			withTrailingSep(normalizeWorktreePath(join(homeDir, dir))),
		),
	);

	const candidatesByRepo = new Map<
		string,
		Map<string, ExternalWorktreeSourceId>
	>();
	for (const root of roots) {
		for (const worktreePath of findWorktreeDirs(
			root.path,
			root.maxDepth,
			maxEntriesPerRoot,
		)) {
			const repoPath = resolveMainRepo(worktreePath);
			if (!repoPath) continue;
			const repoPrefix = withTrailingSep(repoPath);
			if (toolOwnedPrefixes.some((prefix) => repoPrefix.startsWith(prefix))) {
				continue;
			}
			const candidates = candidatesByRepo.get(repoPath) ?? new Map();
			candidates.set(normalizeWorktreePath(worktreePath), root.source);
			candidatesByRepo.set(repoPath, candidates);
		}
	}

	const repos: ExternalWorktreeRepo[] = [];
	for (const [repoPath, candidates] of candidatesByRepo) {
		let records: WorktreeRecord[];
		try {
			records = await listWorktrees(repoPath);
		} catch (error) {
			console.warn("[external-worktrees] skipped a repository", {
				repoPath,
				error,
			});
			continue;
		}
		const worktrees: ExternalWorktree[] = [];
		for (const record of records) {
			if (record.bare || record.prunable || !record.branch) continue;
			const path = normalizeWorktreePath(record.path);
			const source = candidates.get(path);
			if (!source || trackedWorktreePaths.has(path)) continue;
			worktrees.push({ path, branch: record.branch, source });
		}
		if (worktrees.length === 0) continue;
		worktrees.sort((a, b) => a.path.localeCompare(b.path));
		repos.push({ repoPath, name: basename(repoPath), worktrees });
	}
	repos.sort((a, b) => a.name.localeCompare(b.name));
	return repos;
}

function findWorktreeDirs(
	root: string,
	maxDepth: number,
	maxEntries: number,
): string[] {
	const found: string[] = [];
	let visited = 0;
	const walk = (dir: string, depth: number) => {
		if (visited >= maxEntries) return;
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		visited += entries.length;
		if (entries.some((entry) => entry.name === ".git" && entry.isFile())) {
			found.push(dir);
			return;
		}
		if (depth >= maxDepth) return;
		for (const entry of entries) {
			if (!entry.isDirectory() || SKIPPED_DIR_NAMES.has(entry.name)) continue;
			walk(join(dir, entry.name), depth + 1);
		}
	};
	if (isDirectory(root)) walk(root, 0);
	if (visited >= maxEntries) {
		console.warn(
			"[external-worktrees] stopped scanning a folder at the entry limit",
			{
				root,
				maxEntries,
			},
		);
	}
	return found;
}

function resolveMainRepo(worktreePath: string): string | null {
	const gitDir = readPointer(join(worktreePath, ".git"), "gitdir:");
	if (!gitDir) return null;
	const absoluteGitDir = isAbsolute(gitDir)
		? gitDir
		: resolve(worktreePath, gitDir);
	let commonDir: string;
	try {
		commonDir = resolve(
			absoluteGitDir,
			readFileSync(join(absoluteGitDir, "commondir"), "utf8").trim(),
		);
	} catch {
		return null;
	}
	if (basename(commonDir) !== ".git") return null;
	const repoPath = dirname(commonDir);
	return isDirectory(repoPath) ? normalizeWorktreePath(repoPath) : null;
}

function readPointer(file: string, prefix: string): string | null {
	try {
		const content = readFileSync(file, "utf8").trim();
		return content.startsWith(prefix)
			? content.slice(prefix.length).trim()
			: null;
	} catch {
		return null;
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function withTrailingSep(path: string): string {
	return path.endsWith(sep) ? path : `${path}${sep}`;
}
