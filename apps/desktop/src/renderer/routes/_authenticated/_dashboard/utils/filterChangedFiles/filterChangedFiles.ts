/**
 * Case-insensitive path filter for a changed-file list. Every
 * whitespace-separated term must appear somewhere in the file's path — or its
 * pre-rename path, so a rename still turns up under the name the user
 * remembers — letting "sidebar tsx" narrow like an editor quick-open without
 * full fuzzy matching.
 */
export function filterChangedFiles<
	T extends { path: string; oldPath?: string },
>(files: T[], query: string): T[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return files;
	return files.filter((file) => {
		const haystack = (
			file.oldPath ? `${file.path}\n${file.oldPath}` : file.path
		).toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}
