"use client";

import type {
	CloudUsageTarget,
	CloudUsageLink as LinkType,
} from "@superset/ui/cloud-usage-page";
import Link from "next/link";

const BASE = "/settings/cloud-usage";

function hrefOf(to: CloudUsageTarget): string {
	if (to.page === "billing") return "/settings/billing";
	const path =
		to.page === "overview"
			? BASE
			: to.page === "workspaces"
				? `${BASE}/workspaces`
				: `${BASE}/workspaces/${to.workspaceId}`;
	const search = new URLSearchParams();
	if (to.period) search.set("period", to.period);
	if (to.page === "workspaces" && to.user) search.set("user", to.user);
	const query = search.toString();
	return query ? `${path}?${query}` : path;
}

export const CloudUsageLink: LinkType = ({ to, ...props }) => (
	<Link href={hrefOf(to)} {...props} />
);
