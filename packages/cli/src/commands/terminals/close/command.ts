import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import type { HostServiceClient } from "../../../lib/host-target";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import { paneLayoutUnavailableReason } from "../../panes/shared";

interface PaneRemoval {
	removedPaneIds: string[];
	failedPanes: Array<{ paneId: string; error: string }>;
	paneRemovalSkippedReason: string | null;
}

/**
 * Closes every desktop pane showing the terminal. Each close keeps the
 * terminal running; the caller ends it once afterwards, even if a close fails.
 */
async function removeTerminalPanes(
	client: HostServiceClient,
	workspaceId: string,
	terminalId: string,
): Promise<PaneRemoval> {
	const removal: PaneRemoval = {
		removedPaneIds: [],
		failedPanes: [],
		paneRemovalSkippedReason: null,
	};
	let paneIds: string[];
	try {
		const { layout } = await client.panes.list.query({ workspaceId });
		paneIds = layout.tabs
			.flatMap((tab) => tab.panes)
			.filter((pane) => pane.terminalId === terminalId)
			.map((pane) => pane.id);
	} catch (error) {
		const reason = paneLayoutUnavailableReason(error);
		if (!reason) throw error;
		return { ...removal, paneRemovalSkippedReason: reason };
	}
	for (const paneId of paneIds) {
		try {
			await client.panes.close.mutate({
				workspaceId,
				paneId,
				keepTerminal: true,
			});
			removal.removedPaneIds.push(paneId);
		} catch (error) {
			removal.failedPanes.push({
				paneId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return removal;
}

function describeRemoval(terminalId: string, removal: PaneRemoval): string {
	const lines = [`Closed terminal ${terminalId}`];
	if (removal.paneRemovalSkippedReason) {
		lines[0] += `; panes not removed: ${removal.paneRemovalSkippedReason}`;
	} else if (removal.removedPaneIds.length > 0) {
		const noun = removal.removedPaneIds.length === 1 ? "pane" : "panes";
		lines[0] += ` and removed ${noun} ${removal.removedPaneIds.join(", ")}`;
	} else if (removal.failedPanes.length === 0) {
		lines[0] += "; no pane showed it";
	}
	for (const { paneId, error } of removal.failedPanes) {
		lines.push(`Warning: could not close pane ${paneId}: ${error}`);
	}
	return lines.join("\n");
}

export default command({
	description: "Close (dispose) a terminal running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to close"),
		removePane: boolean().desc(
			"Also close the desktop app panes that show the terminal, and their tab when it is left empty",
		),
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

		const removal = options.removePane
			? await removeTerminalPanes(
					target.client,
					options.workspace,
					options.terminal,
				)
			: null;

		const result = await target.client.terminal.killSession.mutate({
			terminalId: options.terminal,
			workspaceId: options.workspace,
		});

		if (!removal) {
			return {
				data: result,
				message: `Closed terminal ${options.terminal}`,
			};
		}
		return {
			data: { ...result, ...removal },
			message: describeRemoval(options.terminal, removal),
		};
	},
});
