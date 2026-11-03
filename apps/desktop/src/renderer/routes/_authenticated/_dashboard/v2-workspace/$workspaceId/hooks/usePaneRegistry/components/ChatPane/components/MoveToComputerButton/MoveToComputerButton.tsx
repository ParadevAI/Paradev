import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MoveToComputerAction } from "./components/MoveToComputerAction";

interface MoveToComputerButtonProps {
	data: ChatPaneData;
	workspaceId: string;
}

export function MoveToComputerButton({
	data,
	workspaceId,
}: MoveToComputerButtonProps) {
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { workspace } = useWorkspace();
	const { machineId } = useLocalHostService();
	const { cache } = useHostWorkspaces();
	const chatSessionId = data.sessionId;

	if (
		!cloudEnabled ||
		data.agent?.id !== "claude" ||
		!chatSessionId ||
		workspace.hostId === machineId ||
		!cache.isSandboxHost(workspace.hostId)
	) {
		return null;
	}

	return (
		<MoveToComputerAction
			chatSessionId={chatSessionId}
			workspaceId={workspaceId}
		/>
	);
}
