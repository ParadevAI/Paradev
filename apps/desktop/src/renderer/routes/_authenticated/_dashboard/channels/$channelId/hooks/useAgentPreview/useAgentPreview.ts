import { previewLine } from "../../utils/previewLine";
import { useAgentLastMessage, useAgentSession } from "../useAgentSession";
import { useAgentWorkspace } from "../useAgentWorkspace";

export interface AgentPreview {
	/** The first line of what the agent last said, or null while unknown. */
	line: string | null;
	/** When it said it, host clock; null while unknown. */
	at: number | null;
	sessionId: string | null;
	hostUrl: string | null;
}

/** What an agent is saying right now, for a row, a card or a note: its newest line and when. */
export function useAgentPreview(workspaceId: string): AgentPreview {
	const { hostUrl } = useAgentWorkspace(workspaceId);
	const session = useAgentSession(workspaceId, hostUrl);
	const sessionId = session.data?.sessionId ?? null;
	const last = useAgentLastMessage(hostUrl, workspaceId, sessionId);
	return {
		line: last.data ? previewLine(last.data.text) : null,
		at: last.data?.at ?? null,
		sessionId,
		hostUrl,
	};
}
