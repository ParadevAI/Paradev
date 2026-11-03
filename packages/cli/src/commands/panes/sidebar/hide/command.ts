import { command } from "../../../../lib/command";
import { resolveHostClient } from "../../../../lib/resolve-host-client";
import { callPanes, layoutResult, workspaceOptions } from "../../shared";

export default command({
	description: "Hide the right sidebar. Its tabs stay open",
	options: workspaceOptions,
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.sidebar.mutate({
				workspaceId: options.workspace,
				open: false,
			}),
		);
		return layoutResult("Sidebar hidden", result);
	},
});
