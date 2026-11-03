import { createAgentSessionClient } from "@superset/chat/client";
import type { UserContent } from "@superset/chat/protocol";
import { useEffect, useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import type { OpenFile } from "../../../../../../types";
import { SessionView } from "../../../ChatSession/components/SessionView";
import type {
	OpenLink,
	OpenPage,
} from "../../../ChatSession/providers/ChatPaneActionsProvider";

/** A Paradev agent's session on this workspace, in the same chat view as any other chat. */
export function AgentChatPane({
	agentSessionId,
	agentName,
	workspaceId,
	isActive,
	pendingPrompts,
	onPendingPromptsSent,
	onOpenFile,
	onOpenPage,
	onOpenLink,
	onOpenHistory,
}: {
	agentSessionId: string;
	agentName?: string;
	workspaceId: string;
	isActive: boolean;
	pendingPrompts: UserContent[][];
	onPendingPromptsSent: () => void;
	onOpenFile?: OpenFile;
	onOpenPage?: OpenPage;
	onOpenLink?: OpenLink;
	onOpenHistory?: () => void;
}) {
	const client = useMemo(
		() =>
			createAgentSessionClient({
				sessionId: agentSessionId,
				...(agentName ? { title: agentName } : {}),
				api: {
					access: (sessionId) =>
						apiTrpcClient.agent.sessionStream.mutate({ sessionId }),
					prompt: (input) => apiTrpcClient.agent.promptSession.mutate(input),
					interrupt: (sessionId) =>
						apiTrpcClient.agent.interruptTurn.mutate({ sessionId }),
				},
			}),
		[agentSessionId, agentName],
	);
	useEffect(() => () => client.close(), [client]);

	return (
		<SessionView
			key={agentSessionId}
			client={client}
			chatKey={agentSessionId}
			draftKey={`agent:${agentSessionId}`}
			workspaceId={workspaceId}
			isActive={isActive}
			pendingPrompts={pendingPrompts}
			onPendingPromptsSent={onPendingPromptsSent}
			agentLabel={agentName}
			openFile={onOpenFile}
			openPage={onOpenPage}
			openLink={onOpenLink}
			onOpenHistory={onOpenHistory}
		/>
	);
}
