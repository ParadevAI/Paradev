import { RECENT_DISPLAY_LIMIT } from "../../constants";
import type { RecentFile } from "../../useRecentlyViewedFiles";

/** Recent files as Quick Open lists them: open files first, matching the query, capped. */
export function matchRecentFiles(
	recentFiles: readonly RecentFile[],
	query: string,
	openFilePaths: ReadonlySet<string>,
): RecentFile[] {
	const open = recentFiles.filter((file) =>
		openFilePaths.has(file.absolutePath),
	);
	const rest = recentFiles.filter(
		(file) => !openFilePaths.has(file.absolutePath),
	);
	const needle = query.trim().toLowerCase();
	return [...open, ...rest]
		.filter((file) => file.relativePath.toLowerCase().includes(needle))
		.slice(0, RECENT_DISPLAY_LIMIT);
}
