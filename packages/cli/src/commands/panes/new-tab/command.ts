import { boolean } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import {
	layoutResult,
	requireSidebar,
	terminalOptions,
	withPaneTerminal,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Open a new tab with a terminal pane, in the main area or the right sidebar. Creates a terminal unless --terminal is set",
	options: {
		...workspaceOptions,
		...terminalOptions,
		sidebar: boolean().desc("Open the tab in the right sidebar"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await withPaneTerminal(
			client,
			options.workspace,
			options,
			(terminalId) =>
				client.panes.newTab.mutate({
					workspaceId: options.workspace,
					terminalId,
					...(options.sidebar ? { area: "sidebar" as const } : {}),
				}),
		);
		if (options.sidebar) {
			requireSidebar(
				result.layout,
				`tab ${result.tabId} opened in the main area instead`,
			);
		}
		return layoutResult(
			`New tab ${result.tabId}: pane ${result.paneId}, terminal ${result.terminalId}`,
			result,
		);
	},
});
