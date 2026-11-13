import type { ChangesetFile } from "../../../../../useChangeset";

/** `paths` and `rootPathOf` are from the workspace folder; a file's own path is from its checkout. */
export function filesInPathFilter(
	files: ChangesetFile[],
	paths: readonly string[],
	rootPathOf: (file: ChangesetFile, path: string) => string,
): ChangesetFile[] {
	const wanted = new Set(paths);
	return files.filter(
		(file) =>
			wanted.has(rootPathOf(file, file.path)) ||
			(file.oldPath !== undefined &&
				wanted.has(rootPathOf(file, file.oldPath))),
	);
}
