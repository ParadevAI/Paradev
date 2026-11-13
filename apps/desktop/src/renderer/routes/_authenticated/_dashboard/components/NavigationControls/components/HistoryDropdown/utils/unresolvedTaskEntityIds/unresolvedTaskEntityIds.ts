import type { RecentlyViewedEntry } from "../../hooks/useRecentlyViewed";

export function unresolvedTaskEntityIds(
	entries: readonly RecentlyViewedEntry[],
	tasks: readonly { task: { id: string; slug: string } }[],
): string[] {
	const known = new Set(tasks.flatMap(({ task }) => [task.id, task.slug]));
	return entries
		.filter((entry) => entry.type === "task" && !known.has(entry.entityId))
		.map((entry) => entry.entityId);
}
