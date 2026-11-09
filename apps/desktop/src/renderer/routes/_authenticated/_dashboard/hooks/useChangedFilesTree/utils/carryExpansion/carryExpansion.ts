import type { TreeShape } from "../buildTreeShape";

type Shape = Pick<TreeShape, "dirs" | "chainDirs">;

function parentOf(dir: string): string {
	const slash = dir.lastIndexOf("/");
	return slash < 0 ? "" : dir.slice(0, slash);
}

/**
 * Records the expansion of each folder the user can see. A folder drawn
 * inside a flattened row reports that row's state, and one under a collapsed
 * folder was never shown, so both keep what was recorded before.
 */
export function recordExpansion(
	shape: Shape,
	isExpanded: (dir: string) => boolean | undefined,
	known: Map<string, boolean>,
	flattened: boolean,
): void {
	const showsChildren = new Map<string, boolean>();
	for (const dir of shape.dirs) {
		const parent = parentOf(dir);
		const visible = parent === "" || showsChildren.get(parent) === true;
		const inChain = flattened && shape.chainDirs.has(dir);
		const expanded = isExpanded(dir) ?? false;
		if (visible && !inChain) known.set(dir, expanded);
		showsChildren.set(dir, visible && (inChain || expanded));
	}
}

/**
 * The folders to pass as `initialExpandedPaths`. Pierre opens the ancestors
 * of every path listed, so a closed folder's descendants are left out.
 */
export function expandedDirs(
	shape: Shape,
	known: Map<string, boolean>,
	defaultOpen: boolean,
	flattened: boolean,
): string[] {
	const open = new Map<string, boolean>();
	const result: string[] = [];
	for (const dir of shape.dirs) {
		const parent = parentOf(dir);
		const parentOpen = parent === "" || open.get(parent) === true;
		const self =
			(flattened && shape.chainDirs.has(dir)) ||
			(known.get(dir) ?? defaultOpen);
		open.set(dir, parentOpen && self);
		if (parentOpen && self) result.push(dir);
	}
	return result;
}
