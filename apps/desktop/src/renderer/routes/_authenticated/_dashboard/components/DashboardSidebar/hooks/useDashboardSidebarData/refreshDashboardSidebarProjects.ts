import type { QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export async function refreshDashboardSidebarProjects(
	queryClient: QueryClient,
	organizationId: string,
): Promise<void> {
	const input = { organizationId };
	const queryKeys = [
		["host-service", "projects", "list", organizationId],
		["host-service", "workspaces", "list", organizationId],
		["host-tag-folders", organizationId],
		["dashboard-sidebar", "pull-requests", organizationId],
		getQueryKey(cloudTrpc.cloudWorkspace.list, input, "query"),
		getQueryKey(cloudTrpc.cloudWorkspace.repositories, input, "query"),
		getQueryKey(
			cloudTrpc.cloudWorkspace.pullRequests,
			{ ...input, archived: false },
			"query",
		),
	];
	const results = await Promise.allSettled(
		queryKeys.map((queryKey) =>
			queryClient.refetchQueries(
				{ queryKey, type: "active" },
				{ throwOnError: true, cancelRefetch: false },
			),
		),
	);
	const failure = results.find((result) => result.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
}
