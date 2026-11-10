import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { ignoreChatTerminal } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/closedChatSessions";
import { forkedChatPaneData } from "../../../../utils/forkedChatPaneData";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";

export function useForkChatIntoChat(
	context: RendererContext<PaneViewerData>,
	workspaceId: string,
): (() => void) | undefined {
	const { t } = useLingui();
	const { transport } = useChatWiring();
	const data = context.pane.data as ChatPaneData;
	const { sessionId } = data;
	const { store } = context;
	const titleOverride = context.pane.titleOverride;

	const fork = () => {
		if (!sessionId) return;
		const terminalId = crypto.randomUUID();
		ignoreChatTerminal(terminalId);
		void transport
			.forkSession({
				commandId: crypto.randomUUID(),
				sessionId,
				workspaceId,
				terminalId,
			})
			.then((forked) => {
				if (!forked) {
					toast.error(t({ message: "This agent can't branch a conversation" }));
					return;
				}
				store.getState().addTab({
					panes: [
						{
							kind: "chat-v3",
							...(titleOverride ? { titleOverride } : {}),
							data: forkedChatPaneData(data, {
								sessionId: forked.sessionId,
								terminalId,
							}),
						},
					],
				});
			})
			.catch((error: unknown) => {
				console.error("[chat-title] fork failed", error);
				toast.error(t({ message: "Couldn't branch the conversation" }));
			});
	};

	return sessionId ? fork : undefined;
}
