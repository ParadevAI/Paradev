import { splitPath } from "renderer/lib/splitPath";

/** The old name of a renamed file, or its old folder ("" for the root) when only the folder changed. */
export function renameSourceLabel(path: string, oldPath: string): string {
	const old = splitPath(oldPath);
	return old.name === splitPath(path).name ? old.dir : old.name;
}
