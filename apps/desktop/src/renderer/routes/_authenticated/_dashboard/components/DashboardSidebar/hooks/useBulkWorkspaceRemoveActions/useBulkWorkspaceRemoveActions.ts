import { useArchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useArchiveCloudWorkspace";
import { useDashboardSidebarSelection } from "../../providers/DashboardSidebarSelectionProvider";
import { useBulkDeleteWorkspacesIntent } from "../../stores/bulkDeleteWorkspacesIntent";
import type { DashboardSidebarWorkspace } from "../../types";
import { splitBulkRemovalTargets } from "../../utils/bulkWorkspaceActions";

export function useBulkWorkspaceRemoveActions(
	selectedWorkspaces: readonly DashboardSidebarWorkspace[],
) {
	const archiveCloudWorkspace = useArchiveCloudWorkspace();
	const { removeSelectedWorkspaces } = useDashboardSidebarSelection();
	const { deletable, archivable } = splitBulkRemovalTargets(selectedWorkspaces);

	const requestDelete = () =>
		useBulkDeleteWorkspacesIntent.getState().request(deletable);

	const archiveSelection = () => {
		const ids = archivable.map((workspace) => workspace.id);
		const batch = new Set(ids);
		for (const id of ids) archiveCloudWorkspace(id, batch);
		removeSelectedWorkspaces(ids);
	};

	return {
		archivableCount: archivable.length,
		archiveSelection,
		deletableCount: deletable.length,
		requestDelete,
	};
}
