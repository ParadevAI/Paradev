import type { CloudUsageTarget } from "@superset/ui/cloud-usage-page";

const BASE = "/settings/cloud-usage";

export function cloudUsageHref(to: CloudUsageTarget): string {
	if (to.view === "billing") return "/settings/billing";
	const path =
		to.view === "overview"
			? BASE
			: to.view === "workspaces"
				? `${BASE}/workspaces`
				: `${BASE}/workspaces/${to.workspaceId}`;
	const { view: _, ...params } = to;
	const search = new URLSearchParams(
		Object.entries(params).flatMap(([key, value]) =>
			key !== "workspaceId" && value !== undefined
				? [[key, String(value)]]
				: [],
		),
	).toString();
	return search ? `${path}?${search}` : path;
}
