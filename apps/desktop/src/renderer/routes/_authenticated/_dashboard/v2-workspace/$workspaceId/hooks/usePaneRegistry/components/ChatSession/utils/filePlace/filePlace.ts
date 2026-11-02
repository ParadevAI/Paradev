import type { DiffPaneFilter } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	isAbsoluteFilesystemPath,
	isWithinWorkspacePath,
	normalizeComparablePath,
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import {
	directoryOf,
	fileName,
} from "../../components/Transcript/utils/fileChange";

export type FilePlace = {
	absolutePath: string;
	/** Null for a file outside the worktree, which no diff of it can show. */
	relativePath: string | null;
	directory: string;
	name: string;
};

/**
 * macOS and Windows let one folder go by two spellings, and an agent can
 * report the one the workspace record does not use.
 */
function relativeIgnoringCase(
	worktreePath: string,
	absolutePath: string,
): string | null {
	const root = normalizeComparablePath(worktreePath);
	const file = normalizeComparablePath(absolutePath);
	if (file.split("/").includes("..")) return null;
	return file.toLowerCase().startsWith(`${root.toLowerCase()}/`)
		? file.slice(root.length + 1)
		: null;
}

/** Where an agent-reported path is, against the worktree the chat runs in. */
export function filePlace(path: string, worktreePath?: string): FilePlace {
	const name = fileName(path);
	if (!worktreePath) {
		return {
			absolutePath: path,
			relativePath: null,
			directory: directoryOf(path, name),
			name,
		};
	}
	const absolutePath = toAbsoluteWorkspacePath(worktreePath, path);
	const inside =
		!isAbsoluteFilesystemPath(path) ||
		isWithinWorkspacePath(worktreePath, absolutePath);
	const relativePath = inside
		? toRelativeWorkspacePath(worktreePath, absolutePath)
		: relativeIgnoringCase(worktreePath, absolutePath);
	const shown = relativePath ?? absolutePath;
	return {
		absolutePath,
		relativePath,
		directory: directoryOf(shown, name),
		name,
	};
}

/** A path git reported relative to the repository root. */
export function rootPlace(root: string, relativePath: string): FilePlace {
	const name = fileName(relativePath);
	return {
		absolutePath: `${root.replace(/[\\/]+$/, "")}/${relativePath}`,
		relativePath,
		directory: directoryOf(relativePath, name),
		name,
	};
}

/** Pane state is persisted, so a turn that changed more files is filtered by its range alone. */
const MAX_FILTER_PATHS = 200;

/** The diff pane filter for a set of files, or null when none is in the worktree. */
export function reviewFilter(
	places: readonly FilePlace[],
	range?: DiffPaneFilter["range"],
): DiffPaneFilter | null {
	const paths = places.flatMap((place) =>
		place.relativePath ? [place.relativePath] : [],
	);
	if (paths.length === 0) return null;
	if (paths.length > MAX_FILTER_PATHS) return range ? { range } : null;
	return { paths, ...(range ? { range } : {}) };
}
