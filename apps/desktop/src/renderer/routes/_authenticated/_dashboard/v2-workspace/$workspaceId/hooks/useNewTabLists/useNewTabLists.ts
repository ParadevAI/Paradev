import { workspaceTrpc } from "@superset/workspace-client";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useCloudPullRequests } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
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
	const host = useWorkspaceHostTarget(workspaceId);
	const isCloud = host.status === "ready" && host.kind === "sandbox";
	// TODO: local workspaces get +/- counts once host-service stores PR line
	// counts in its PR history; until then only cloud workspaces have them.
	const { byWorkspace } = useCloudPullRequests({
		active: isCloud,
		archived: false,
	});
	const countsByNumber = new Map(
		(byWorkspace.get(workspaceId) ?? []).map((pr) => [
			pr.number,
			{ additions: pr.additions, deletions: pr.deletions },
		]),
	);

	return {
		pages: pages.data?.items.slice(0, PAGE_LIMIT) ?? [],
		pullRequests: newestPullRequests(
			history.data?.workspaces[0]?.pullRequests ?? [],
		).map((pr) => ({ ...pr, ...countsByNumber.get(pr.number) })),
	};
}

export type NewTabLists = ReturnType<typeof useNewTabLists>;
