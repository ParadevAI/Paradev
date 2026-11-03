import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import {
	placeTerminal,
	resolveSplitPlacement,
	splitOptions,
} from "../../../lib/pane-placement";
import { withPaneTerminal } from "../../panes/shared";

export default command({
	description: "Create a terminal session in an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on, or `cloud` (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		command: string().desc(
			"Shell command to run in the terminal. Omit to open an interactive shell",
		),
		cwd: string().desc(
			"Working directory for the terminal (defaults to the worktree)",
		),
		...splitOptions,
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

		const placement = await resolveSplitPlacement(
			target.client,
			options.workspace,
			options,
		);
		if (placement) {
			const placed = await withPaneTerminal(
				target.client,
				options.workspace,
				options,
				(terminalId) =>
					placeTerminal(
						target.client,
						options.workspace,
						terminalId,
						placement,
					),
			);
			return {
				data: { terminalId: placed.terminalId, paneId: placed.paneId },
				message: `Created terminal ${placed.terminalId} in pane ${placed.paneId}, beside ${placement.besidePaneId}`,
			};
		}

		const result = await target.client.terminal.createSession.mutate({
			workspaceId: options.workspace,
			initialCommand: options.command ?? undefined,
			cwd: options.cwd ?? undefined,
		});

		return {
			data: result,
			message: `Created terminal ${result.terminalId} in workspace ${options.workspace}`,
		};
	},
});
