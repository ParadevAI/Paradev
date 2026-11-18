const text = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : undefined;

/** `period` is a period id; absent means the newest. `user` filters the Workspaces page by person. */
export function cloudUsageSearch(search: Record<string, unknown>): {
	period?: string;
	user?: string;
} {
	return { period: text(search.period), user: text(search.user) };
}
