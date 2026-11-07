import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function restartedChatPaneData(
	current: ChatPaneData,
	next: Omit<ChatPaneData, "terminalId" | "draftId" | "sessionId">,
): ChatPaneData {
	return {
		terminalId: current.terminalId,
		...(current.draftId ? { draftId: current.draftId } : {}),
		sessionId: null,
		...next,
	};
}
