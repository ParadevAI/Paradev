import type { RendererContext } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useForkChatSession } from "../../../../hooks/useForkChatSession";
import { forkedChatPaneData } from "../../../../utils/forkedChatPaneData";

export function useForkChatIntoChat(
	context: RendererContext<PaneViewerData>,
	workspaceId: string,
): (() => void) | undefined {
	const forkChatSession = useForkChatSession(workspaceId);
	const data = context.pane.data as ChatPaneData;
	const { sessionId } = data;
	if (!sessionId) return undefined;
	const { store } = context;
	const titleOverride = context.pane.titleOverride;

	return () => {
		void forkChatSession(sessionId).then((forked) => {
			if (!forked) return;
			store.getState().addTab({
				panes: [
					{
						kind: "chat-v3",
						...(titleOverride ? { titleOverride } : {}),
						data: forkedChatPaneData(data, forked),
					},
				],
			});
		});
	};
}
