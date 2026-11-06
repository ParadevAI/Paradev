import type { SessionInfo } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane/utils/sessionInfoFromState";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function sessionInfoPaneData(
	current: ChatPaneData,
	{ harnessSessionId, title, modelId, effortId, modeId }: SessionInfo,
): ChatPaneData | null {
	const rebound = harnessSessionId !== undefined && current.agent;
	const changed = {
		...(title !== undefined && title !== current.chatTitle
			? { chatTitle: title }
			: {}),
		...(modelId !== undefined && modelId !== current.chatModelId
			? { chatModelId: modelId }
			: {}),
		...(effortId !== undefined && effortId !== current.chatEffortId
			? { chatEffortId: effortId }
			: {}),
		...(modeId !== undefined && modeId !== current.chatModeId
			? { chatModeId: modeId }
			: {}),
	};
	if (!rebound && Object.keys(changed).length === 0) return null;
	return {
		...current,
		...(rebound ? { agent: { ...rebound, sessionId: harnessSessionId } } : {}),
		...changed,
	};
}
