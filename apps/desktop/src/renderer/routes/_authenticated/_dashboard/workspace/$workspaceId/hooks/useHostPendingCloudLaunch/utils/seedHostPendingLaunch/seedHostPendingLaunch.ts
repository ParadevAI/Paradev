import type { WorkspaceStore } from "@superset/panes";
import type { PendingCloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { withPendingCloudLaunch } from "renderer/stores/workspace-creates/pendingCloudLaunch";
import type { StoreApi } from "zustand";
import type { PaneViewerData } from "../../../../types";
import { isChatTerminalIgnored } from "../../../../utils/closedChatSessions";

/** Opens the waiting pane the box reported, unless the user closed it. */
export function seedHostPendingLaunch(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	launch: PendingCloudAgentLaunch,
): void {
	if (!launch.terminalId || isChatTerminalIgnored(launch.terminalId)) return;
	store
		.getState()
		.replaceState(
			(state) =>
				withPendingCloudLaunch(state, launch, { prompt: launch.prompt }) ??
				state,
		);
}
