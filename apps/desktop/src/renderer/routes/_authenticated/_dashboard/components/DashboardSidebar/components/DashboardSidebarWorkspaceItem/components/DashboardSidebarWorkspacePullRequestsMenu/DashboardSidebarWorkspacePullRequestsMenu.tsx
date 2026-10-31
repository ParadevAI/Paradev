import type { WorkspacePullRequestSummary } from "renderer/lib/github/workspacePullRequests";
import { WorkspacePullRequestsMenu } from "renderer/routes/_authenticated/_dashboard/components/WorkspacePullRequestsMenu";
import { useDashboardSidebarChipHoverSuppression } from "../../hooks/useDashboardSidebarChipHoverSuppression";

interface DashboardSidebarWorkspacePullRequestsMenuProps {
	workspaceId: string;
	pullRequests: readonly WorkspacePullRequestSummary[] | undefined;
	currentUrl?: string | null;
}

export function DashboardSidebarWorkspacePullRequestsMenu(
	props: DashboardSidebarWorkspacePullRequestsMenuProps,
) {
	const { onOpenChange } = useDashboardSidebarChipHoverSuppression();
	return <WorkspacePullRequestsMenu {...props} onOpenChange={onOpenChange} />;
}
