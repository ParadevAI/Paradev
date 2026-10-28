import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";

const PAGE_LIMIT = 4;
const PULL_REQUEST_LIMIT = 5;
const REFRESH_MS = 60_000;

export function useNewTabLists(workspaceId: string) {
	const organizationId = useActiveOrganizationId();
	const refresh = { staleTime: REFRESH_MS, refetchInterval: REFRESH_MS };
	const pages = cloudTrpc.page.listPaginated.useQuery(
		pagesListInput({ workspaceId, limit: PAGE_LIMIT }),
		refresh,
	);
	const pullRequests =
		cloudTrpc.integration.github.listOrganizationPullRequests.useQuery(
			{ organizationId: organizationId ?? "" },
			{ ...refresh, enabled: organizationId !== null },
		);

	return {
		pages: pages.data?.items.slice(0, PAGE_LIMIT) ?? [],
		pullRequests: (pullRequests.data ?? [])
			.filter((row) => row.state === "open")
			.slice(0, PULL_REQUEST_LIMIT),
	};
}

export type NewTabLists = ReturnType<typeof useNewTabLists>;
