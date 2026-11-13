import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { ignoreChatTerminal } from "../../../../utils/closedChatSessions";
import { useChatWiring } from "../../components/ChatSession/hooks/useSessionClient";
import { chatHasMessages } from "../../utils/chatHasMessages";

export interface ForkedChat {
	sessionId: string;
	terminalId: string;
}

/**
 * Branches a chat into a new session. Explains in a toast and resolves to
 * null when there is nothing to branch yet or the agent can't branch.
 */
export function useForkChatSession(
	workspaceId: string,
): (sessionId: string) => Promise<ForkedChat | null> {
	const { t } = useLingui();
	const { transport } = useChatWiring();

	return useCallback(
		async (sessionId) => {
			if (!(await chatHasMessages(transport, sessionId).catch(() => true))) {
				toast.error(
					t({ message: "Nothing to open yet. Send a message first." }),
				);
				return null;
			}
			const terminalId = crypto.randomUUID();
			ignoreChatTerminal(terminalId);
			try {
				const forked = await transport.forkSession({
					commandId: crypto.randomUUID(),
					sessionId,
					workspaceId,
					terminalId,
				});
				if (forked) return { sessionId: forked.sessionId, terminalId };
				// The adapter declines rather than sending a `session/fork` an
				// agent would reject, and a button that does nothing is worse
				// than one that says why.
				toast.error(t({ message: "This agent can't branch a conversation" }));
			} catch (error) {
				console.error("[chat-fork] fork failed", error);
				toast.error(t({ message: "Couldn't branch the conversation" }));
			}
			return null;
		},
		[transport, workspaceId, t],
	);
}
