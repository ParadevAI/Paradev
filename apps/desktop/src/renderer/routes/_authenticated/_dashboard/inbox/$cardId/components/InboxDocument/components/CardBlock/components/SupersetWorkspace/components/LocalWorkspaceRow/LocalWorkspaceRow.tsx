import { DashboardSidebarHoverProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarHoverProvider";
import { DashboardSidebarWorkspaceStatusProvider } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarWorkspaceStatusProvider";
import type { DashboardSidebarWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import { StatusRow } from "./components/StatusRow";

interface LocalWorkspaceRowProps {
	workspace: DashboardSidebarWorkspace;
	diffStats: { additions: number; deletions: number } | null;
	onOpen: () => void;
}

/** The sidebar's local workspace row, with the live agent status its host reports and the hover state its agent chips need. */
export function LocalWorkspaceRow(props: LocalWorkspaceRowProps) {
	return (
		<DashboardSidebarWorkspaceStatusProvider
			workspaces={[{ id: props.workspace.id, hostId: props.workspace.hostId }]}
			activeWorkspaceId={null}
		>
			<DashboardSidebarHoverProvider>
				<StatusRow {...props} />
			</DashboardSidebarHoverProvider>
		</DashboardSidebarWorkspaceStatusProvider>
	);
}
