import type { TurnChangedFile, TurnChanges } from "@superset/chat-runtime";
import {
	type FilePlace,
	filePlace,
	rootPlace,
} from "../../../../../../../../utils/filePlace";
import type { DiffStats } from "../../../../../../utils/diffStats";
import type { FileChangeKind } from "../../../../../../utils/fileChange";
import type { TurnFileChange } from "../../../../../../utils/turnChangedFiles";

export type CardFile = {
	place: FilePlace;
	kind: FileChangeKind;
	stats: DiffStats | null;
	line?: number;
};

export type CardFiles = {
	files: CardFile[];
	/** Changed by someone else in the worktree while a shared turn ran. */
	others: CardFile[];
	/** False when a shared turn touched none of `files` through its own edits. */
	own: boolean;
};

const KIND_BY_STATUS: Record<TurnChangedFile["status"], FileChangeKind> = {
	added: "added",
	deleted: "deleted",
	modified: "modified",
};

function snapshotFile(
	root: string,
	file: TurnChangedFile,
	line: number | undefined,
): CardFile {
	return {
		place: rootPlace(root, file.path),
		kind: KIND_BY_STATUS[file.status],
		stats:
			file.additions === null || file.deletions === null
				? null
				: { additions: file.additions, deletions: file.deletions },
		...(line ? { line } : {}),
	};
}

/**
 * The rows of a turn's card. Snapshots, when the turn has them, are exact
 * and include shell edits; the tool calls still say which files this chat
 * touched, in what order, and where each change starts. A turn that ran
 * beside another chat's lists only its own files, and the rest apart; with
 * none of its own, as when it edited only through shell commands, it lists
 * every file and claims none. Files committed since the turn drop off.
 */
export function cardFiles(
	toolFiles: readonly TurnFileChange[],
	changes: TurnChanges | null | undefined,
	worktreePath?: string,
): CardFiles {
	if (!changes) {
		return {
			files: toolFiles.map((file) => ({
				place: filePlace(file.path, worktreePath),
				kind: file.kind,
				stats: file.stats,
				...(file.line ? { line: file.line } : {}),
			})),
			others: [],
			own: true,
		};
	}
	const touchOrder = new Map<string, number>();
	const lineByPath = new Map<string, number>();
	for (const file of toolFiles) {
		const relativePath = filePlace(file.path, changes.root).relativePath;
		if (!relativePath || touchOrder.has(relativePath)) continue;
		touchOrder.set(relativePath, touchOrder.size);
		if (file.line) lineByPath.set(relativePath, file.line);
	}
	const ordered = [...changes.files].sort(
		(left, right) =>
			(touchOrder.get(left.path) ?? Number.POSITIVE_INFINITY) -
			(touchOrder.get(right.path) ?? Number.POSITIVE_INFINITY),
	);
	const committed = new Set(changes.committed);
	const rows = ordered
		.filter((file) => !committed.has(file.path))
		.map((file) => snapshotFile(changes.root, file, lineByPath.get(file.path)));
	if (!changes.shared) return { files: rows, others: [], own: true };
	const touched = (row: CardFile) =>
		touchOrder.has(row.place.relativePath ?? "");
	const files = rows.filter(touched);
	if (files.length === 0) return { files: rows, others: [], own: false };
	return {
		files,
		others: rows.filter((row) => !touched(row)),
		own: true,
	};
}
