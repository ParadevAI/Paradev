import { workspaceTrpc } from "@superset/workspace-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { newestPullRequests } from "./utils/newestPullRequests";

const PAGE_LIMIT = 4;
const REFRESH_MS = 60_000;

export function useNewTabLists(workspaceId: string) {
	const refresh = { staleTime: REFRESH_MS, refetchInterval: REFRESH_MS };
	const pages = cloudTrpc.page.listPaginated.useQuery(
		pagesListInput({ workspaceId, limit: PAGE_LIMIT }),
		refresh,
	);
	const history = workspaceTrpc.pullRequests.historyByWorkspaces.useQuery(
		{ workspaceIds: [workspaceId] },
		refresh,
	);

	return {
		pages: pages.data?.items.slice(0, PAGE_LIMIT) ?? [],
		pullRequests: newestPullRequests(
			history.data?.workspaces[0]?.pullRequests ?? [],
		).map((pr) => ({
			...pr,
			ref: {
				repoFullName: `${pr.repoOwner}/${pr.repoName}`,
				number: pr.number,
			},
		})),
	};
}

export type NewTabLists = ReturnType<typeof useNewTabLists>;
