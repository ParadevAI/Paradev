import type { WorkspaceState } from "@superset/panes";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

type PaneLayout = WorkspaceState<PaneViewerData> | null | undefined;

/** True when the terminal belongs to a chat pane, not a terminal agent. */
export function isChatTerminal(
	terminalId: string,
	layouts: PaneLayout[],
): boolean {
	return layouts.some((layout) =>
		(layout?.tabs ?? []).some((tab) =>
			Object.values(tab.panes).some(
				(pane) =>
					pane.kind === "chat-v3" &&
					(pane.data as { terminalId?: string }).terminalId === terminalId,
			),
		),
	);
}

/**
 * A chat whose agent failed before it started has the user still at the chat
 * they just sent, so it gets no chime. On a Mac whose output device also
 * records (a headset, a VM), any sound the app plays makes macOS ask for the
 * microphone. Terminal agents chime as before.
 */
export function lifecycleChimes(
	payload: AgentLifecyclePayload,
	isChat: boolean,
): boolean {
	return !(
		isChat &&
		payload.eventType === "Failed" &&
		payload.agent?.sessionId === undefined
	);
}
