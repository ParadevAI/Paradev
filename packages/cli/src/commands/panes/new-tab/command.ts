import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import {
	callPanes,
	layoutResult,
	requireSidebar,
	terminalOptions,
	withPaneTerminal,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Open a new tab with a terminal or chat pane, in the main area or the right sidebar. Creates a terminal unless --terminal or --session is set",
	options: {
		...workspaceOptions,
		...terminalOptions,
		session: string().desc("Chat session to show in the new tab"),
		focus: boolean().desc("Select the new tab"),
		sidebar: boolean().desc("Open the tab in the right sidebar"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const area = options.sidebar ? { area: "sidebar" as const } : {};
		const focus = options.focus ? { focus: true } : {};
		if (options.session) {
			if (options.terminal || options.command) {
				throw new CLIError(
					"--session opens a chat, not a terminal",
					"Drop --terminal and --command, or drop --session",
				);
			}
			const sessionId = options.session;
			const result = await callPanes(() =>
				client.panes.newTab.mutate({
					workspaceId: options.workspace,
					sessionId,
					...area,
					...focus,
				}),
			).catch((error: unknown) => {
				// An older host drops `sessionId` and then asks for a terminal.
				if (error instanceof Error && /terminalId/.test(error.message)) {
					throw new CLIError(
						"This host is too old to open a chat session in a tab",
						"Update the Paradev desktop app on that host",
					);
				}
				throw error;
			});
			if (options.sidebar) {
				requireSidebar(
					result.layout,
					`tab ${result.tabId} opened in the main area instead`,
				);
			}
			return layoutResult(
				`New tab ${result.tabId}: pane ${result.paneId}, chat session ${sessionId}`,
				result,
			);
		}
		const result = await withPaneTerminal(
			client,
			options.workspace,
			options,
			(terminalId) =>
				client.panes.newTab.mutate({
					workspaceId: options.workspace,
					terminalId,
					...area,
					...focus,
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
