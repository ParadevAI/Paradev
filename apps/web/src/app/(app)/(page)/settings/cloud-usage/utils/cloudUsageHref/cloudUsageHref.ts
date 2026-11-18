import type { CloudUsageTarget } from "@superset/ui/cloud-usage-page";

const BASE = "/settings/cloud-usage";

export function cloudUsageHref(to: CloudUsageTarget): string {
	if (to.page === "billing") return "/settings/billing";
	const path =
		to.page === "overview"
			? BASE
			: to.page === "workspaces"
				? `${BASE}/workspaces`
				: `${BASE}/workspaces/${to.workspaceId}`;
	const { page: _, ...params } = to;
	const search = new URLSearchParams(
		Object.entries(params).filter(
			(entry): entry is [string, string] =>
				typeof entry[1] === "string" && entry[0] !== "workspaceId",
		),
	).toString();
	return search ? `${path}?${search}` : path;
}
