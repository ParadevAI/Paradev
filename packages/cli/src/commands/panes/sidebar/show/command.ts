import { boolean } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveHostClient } from "../../../../lib/resolve-host-client";
import { callPanes, layoutResult, workspaceOptions } from "../../shared";

export default command({
	description:
		"Show the right sidebar. Without --full-screen, a full-screen sidebar goes back to its width",
	options: {
		...workspaceOptions,
		fullScreen: boolean().desc("Expand the sidebar to fill the workspace"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const fullScreen = options.fullScreen ?? false;
		const result = await callPanes(() =>
			client.panes.sidebar.mutate({
				workspaceId: options.workspace,
				open: true,
				fullScreen,
			}),
		);
		return layoutResult(
			fullScreen ? "Sidebar shown full screen" : "Sidebar shown",
			result,
		);
	},
});
