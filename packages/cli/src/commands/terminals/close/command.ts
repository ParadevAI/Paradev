import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import { closePanes } from "../../../lib/pane-placement";

export default command({
	description:
		"End a terminal running in a workspace and close the panes that show it",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on, or `cloud` (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to close"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			options.workspace,
		);

		const closedPaneIds = await closePanes(
			target.client,
			options.workspace,
			(pane) => pane.terminalId === options.terminal,
		);
		const result = await target.client.terminal.killSession.mutate({
			terminalId: options.terminal,
			workspaceId: options.workspace,
		});

		return {
			data: { ...result, closedPaneIds },
			message: `Closed terminal ${options.terminal}${closedPaneIds.length > 0 ? ` and its pane ${closedPaneIds.join(", ")}` : ""}`,
		};
	},
});
