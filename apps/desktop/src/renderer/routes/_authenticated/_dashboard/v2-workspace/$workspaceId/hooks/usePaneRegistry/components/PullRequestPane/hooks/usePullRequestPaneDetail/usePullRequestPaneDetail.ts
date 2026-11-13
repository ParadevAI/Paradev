import { useIsTabVisible } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { isHostProjectRow } from "renderer/hooks/host-projects/useHostProjects";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function usePullRequestPaneDetail(ref: PullRequestRef) {
	const { workspace } = useWorkspace();
	const isTabVisible = useIsTabVisible();
	const projectQuery = workspaceTrpc.project.get.useQuery(
		{ projectId: workspace.projectId ?? "" },
		{
			enabled: !!workspace.projectId,
			select: (row) => (row && isHostProjectRow(row) ? row : null),
		},
	);
	return usePullRequestDetail({
		projectId: workspace.projectId ?? null,
		projectQuery,
		repoFullName: ref.repoFullName,
		prNumber: ref.number,
		enabled: isTabVisible,
	});
}
