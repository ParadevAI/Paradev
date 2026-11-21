import type { ChatPaneData } from "../../../../types";

export function forkedChatPaneData(
	source: ChatPaneData,
	fork: { sessionId: string; terminalId: string },
): ChatPaneData {
	const { agent, chatModelId, chatEffortId, chatModeId, chatTitle } = source;
	return {
		terminalId: fork.terminalId,
		sessionId: fork.sessionId,
		...(agent ? { agent: { id: agent.id } } : {}),
		...(chatModelId ? { chatModelId } : {}),
		...(chatEffortId ? { chatEffortId } : {}),
		...(chatModeId ? { chatModeId } : {}),
		...(chatTitle ? { chatTitle } : {}),
	};
}
