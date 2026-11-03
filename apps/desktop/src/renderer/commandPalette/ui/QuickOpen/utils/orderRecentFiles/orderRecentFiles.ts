import type { RecentFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";

/**
 * Recently viewed files for the top of the files frame: open ones first,
 * narrowed by the query, capped.
 */
export function orderRecentFiles(
	recentFiles: RecentFile[],
	openFilePaths: ReadonlySet<string>,
	query: string,
	limit: number,
): RecentFile[] {
	const needle = query.trim().toLowerCase();
	const open: RecentFile[] = [];
	const rest: RecentFile[] = [];
	for (const file of recentFiles) {
		if (needle && !file.relativePath.toLowerCase().includes(needle)) continue;
		(openFilePaths.has(file.absolutePath) ? open : rest).push(file);
	}
	return [...open, ...rest].slice(0, limit);
}
