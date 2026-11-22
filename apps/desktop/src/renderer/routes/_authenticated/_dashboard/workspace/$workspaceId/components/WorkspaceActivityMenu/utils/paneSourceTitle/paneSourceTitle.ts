import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";

export function paneSourceTitle(
	states: readonly WorkspaceState<PaneViewerData>[],
	terminalId: string,
): string | undefined {
	for (const state of states)
		for (const tab of state.tabs)
			for (const pane of Object.values(tab.panes)) {
				const data = pane.data as { terminalId?: string; chatTitle?: string };
				if (data.terminalId !== terminalId) continue;
				return pane.titleOverride || data.chatTitle || tab.titleOverride;
			}
	return undefined;
}
