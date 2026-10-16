import { useNavigate } from "@tanstack/react-router";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { SupersetWorkspaceView } from "../../types";

/** Opens a card's workspace where the sidebar would: the cloud record page, or the local workspace. */
export function useOpenWorkspace() {
	const navigate = useNavigate();
	return (workspace: Pick<SupersetWorkspaceView, "id" | "location">) => {
		if (workspace.location === "cloud") {
			void navigate({
				to: "/cloud-workspaces/$workspaceId",
				params: { workspaceId: workspace.id },
			});
		} else {
			void navigateToV2Workspace(workspace.id, navigate);
		}
	};
}
