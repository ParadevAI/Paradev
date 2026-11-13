import { acpHarnessForPreset } from "@superset/chat/core";
import type { CreatePaneInput, Pane } from "@superset/panes";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";

export function newSplitPane(
	source: Pick<Pane<PaneViewerData>, "kind" | "data"> | undefined,
	mintTerminalId: () => string,
): CreatePaneInput<PaneViewerData> {
	if (source?.kind === "chat-v3") {
		const { agent, chatModelId, chatModeId } = source.data as ChatPaneData;
		if (agent?.id && acpHarnessForPreset(agent.id)) {
			const label =
				agent.id in AGENT_IDENTITY_LABELS
					? AGENT_IDENTITY_LABELS[
							agent.id as keyof typeof AGENT_IDENTITY_LABELS
						]
					: undefined;
			return {
				kind: "chat-v3",
				...(label ? { titleOverride: label } : {}),
				data: {
					terminalId: crypto.randomUUID(),
					sessionId: null,
					agent: { id: agent.id },
					...(chatModelId ? { chatModelId } : {}),
					...(chatModeId ? { chatModeId } : {}),
				} satisfies ChatPaneData,
			};
		}
	}
	return {
		kind: "terminal",
		data: {
			terminalId: mintTerminalId(),
			createOnAttach: true,
		} as TerminalPaneData,
	};
}
