import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";

/** Items that refused to load in full, with the diff they refused it for. */
export type TooLargeMarks = ReadonlyMap<string, FileDiffMetadata>;

/** The item showing this diff. Pierre hands `loadDiffFiles` the item's own
 * object, and one path can be listed as both staged and unstaged. */
export function findItemIdForDiff<T>(
	items: readonly CodeViewItem<T>[],
	fileDiff: FileDiffMetadata,
): string | undefined {
	return items.find(
		(item) => item.type === "diff" && item.fileDiff === fileDiff,
	)?.id;
}

/** Keeps a mark only while its item still shows the diff it was made for, so
 * a file that changes, or leaves the changeset, can load again. */
export function pruneTooLargeMarks<T>(
	marks: TooLargeMarks,
	items: readonly CodeViewItem<T>[],
): TooLargeMarks {
	if (marks.size === 0) return marks;
	const diffByItemId = new Map<string, FileDiffMetadata>();
	for (const item of items) {
		if (item.type === "diff") diffByItemId.set(item.id, item.fileDiff);
	}
	const kept = new Map(
		[...marks].filter(([itemId, diff]) => diffByItemId.get(itemId) === diff),
	);
	return kept.size === marks.size ? marks : kept;
}
