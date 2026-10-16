import { DashboardSidebarExpandedWorkspaceRow } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarExpandedWorkspaceRow";
import { useSidebarWorkspaceStatus } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarWorkspaceStatusProvider";
import type { DashboardSidebarWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";

interface StatusRowProps {
	workspace: DashboardSidebarWorkspace;
	diffStats: { additions: number; deletions: number } | null;
	onOpen: () => void;
}

export function StatusRow({ workspace, diffStats, onOpen }: StatusRowProps) {
	const { status } = useSidebarWorkspaceStatus(workspace.id);
	return (
		<DashboardSidebarExpandedWorkspaceRow
			className="mx-0"
			workspace={workspace}
			isActive={false}
			isRenaming={false}
			renameValue=""
			diffStats={diffStats}
			workspaceStatus={status}
			indentation="top-level"
			onClick={onOpen}
			onCloseWorkspaceClick={() => {}}
			onRemoveFromSidebarClick={() => {}}
			onRenameValueChange={() => {}}
			onSubmitRename={() => {}}
			onCancelRename={() => {}}
		/>
	);
}
