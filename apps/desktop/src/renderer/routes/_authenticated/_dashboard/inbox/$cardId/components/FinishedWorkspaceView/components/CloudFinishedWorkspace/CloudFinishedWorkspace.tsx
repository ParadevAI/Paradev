import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { useCloudWorkspaceListItems } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceListItems";
import { cloudToWorkspaceView } from "renderer/routes/_authenticated/_dashboard/utils/workspaceCardView";
import { FinishedCard } from "../FinishedCard";

interface CloudFinishedWorkspaceProps {
	workspace: CloudWorkspaceRow;
}

/** A cloud workspace, read from the list the sidebar's cloud section uses. Its own page has the composer, so the card only opens it. */
export function CloudFinishedWorkspace({
	workspace,
}: CloudFinishedWorkspaceProps) {
	const { toItem } = useCloudWorkspaceListItems([workspace]);
	const item = toItem(workspace);
	return (
		<FinishedCard
			workspace={cloudToWorkspaceView(
				workspace,
				item.repos[0] ?? null,
				item.pullRequests[0] ?? null,
			)}
			pending={false}
			failure={null}
			sent={false}
		/>
	);
}
