import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function sessionInfoPaneData(
	current: ChatPaneData,
	{
		harnessSessionId,
		title,
		modeId,
	}: { harnessSessionId?: string; title?: string; modeId?: string },
): ChatPaneData | null {
	const rebound = harnessSessionId !== undefined && current.agent;
	const retitled = title !== undefined && title !== current.chatTitle;
	const remode = modeId !== undefined && modeId !== current.chatModeId;
	if (!rebound && !retitled && !remode) return null;
	return {
		...current,
		...(rebound ? { agent: { ...rebound, sessionId: harnessSessionId } } : {}),
		...(retitled ? { chatTitle: title } : {}),
		...(remode ? { chatModeId: modeId } : {}),
	};
}
