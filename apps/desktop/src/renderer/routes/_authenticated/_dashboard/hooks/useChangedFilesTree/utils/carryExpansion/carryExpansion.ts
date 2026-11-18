import type { TreeShape } from "../buildTreeShape";

type Shape = Pick<TreeShape, "dirs" | "chainDirs">;

/**
 * Records each folder's expansion. A folder drawn inside a flattened row
 * reports that row's state, so it keeps what was recorded before.
 */
export function recordExpansion(
	shape: Shape,
	isExpanded: (dir: string) => boolean | undefined,
	known: Map<string, boolean>,
	flattened: boolean,
): void {
	for (const dir of shape.dirs) {
		if (flattened && shape.chainDirs.has(dir)) continue;
		const expanded = isExpanded(dir);
		if (expanded !== undefined) known.set(dir, expanded);
	}
}

/**
 * Splits folders into those to list as `initialExpandedPaths` and those to
 * collapse after the reset: Pierre opens the ancestors of every listed path,
 * so a closed folder with open subfolders is collapsed afterwards.
 */
export function planExpansion(
	shape: Shape,
	known: Map<string, boolean>,
	defaultOpen: boolean,
	flattened: boolean,
): { expand: string[]; collapse: string[] } {
	const expand: string[] = [];
	const collapse: string[] = [];
	for (const dir of shape.dirs) {
		const open =
			(flattened && shape.chainDirs.has(dir)) ||
			(known.get(dir) ?? defaultOpen);
		(open ? expand : collapse).push(dir);
	}
	return { expand, collapse };
}
