import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useRestoreCloudWorkspaceIntent } from "renderer/stores/restore-cloud-workspace-intent";

/**
 * Restores an archived cloud workspace in place: the list that asked stays
 * on screen, and the toast offers the workspace.
 */
export function RestoreCloudWorkspaceMount() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const target = useRestoreCloudWorkspaceIntent((state) => state.target);
	const close = useRestoreCloudWorkspaceIntent((state) => state.close);
	const unarchive = useUnarchiveCloudWorkspace();

	useEffect(() => {
		if (!target) return;
		const { workspaceId, workspaceName } = target;
		close(workspaceId);
		unarchive(workspaceId, {
			open: false,
			onSuccess: () =>
				toast.success(t({ message: `Restored "${workspaceName}"` }), {
					action: {
						label: t({ message: "Open" }),
						onClick: () => navigateToV2Workspace(workspaceId, navigate),
					},
				}),
		});
	}, [target, close, unarchive, t, navigate]);

	return null;
}
