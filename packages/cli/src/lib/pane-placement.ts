import { CLIError, string } from "@superset/cli-framework";
import {
	allLayoutTabs,
	PANE_SPLIT_DIRECTIONS,
	type PaneLayoutPane,
	type PaneSplitDirection,
} from "@superset/shared/pane-layout-ops";
import type { HostServiceClient } from "./host-target";

export const splitOptions = {
	split: string()
		.enum(...PANE_SPLIT_DIRECTIONS)
		.desc(
			"Open it in your own tab, split beside your pane (or --pane) on this side, instead of in a new tab",
		),
	pane: string().desc(
		"Pane to split beside with --split (default: the pane of the terminal you run this in)",
	),
};

export interface SplitPlacement {
	direction: PaneSplitDirection;
	besidePaneId: string;
}

type PaneMatch = (pane: PaneLayoutPane) => boolean;

async function listPanes(
	client: HostServiceClient,
	workspaceId: string,
): Promise<PaneLayoutPane[]> {
	const { layout } = await client.panes.list.query({ workspaceId });
	return allLayoutTabs(layout).flatMap((tab) => tab.panes);
}

/**
 * Turns `--split`/`--pane` into a placement, before anything is launched, so a
 * bad target fails without leaving a session behind.
 */
export async function resolveSplitPlacement(
	client: HostServiceClient,
	workspaceId: string,
	options: { split?: PaneSplitDirection | null; pane?: string | null },
): Promise<SplitPlacement | null> {
	if (!options.split) {
		if (options.pane) {
			throw new CLIError(
				"--pane only applies with --split",
				"Add --split right|left|down|up",
			);
		}
		return null;
	}
	const callerTerminalId = process.env.SUPERSET_TERMINAL_ID;
	const panes = await listPanes(client, workspaceId).catch((error) => {
		throw new CLIError(
			`Cannot read the pane layout of workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
			"--split needs the Paradev desktop app open on that host",
		);
	});
	const besidePane = options.pane
		? panes.find((pane) => pane.id === options.pane)
		: panes.find(
				(pane) => callerTerminalId && pane.terminalId === callerTerminalId,
			);
	if (!besidePane) {
		throw new CLIError(
			options.pane
				? `No pane ${options.pane} in workspace ${workspaceId}`
				: "No pane shows the terminal you run this in",
			"Pass --pane (see `superset panes list`), or run it from a terminal in that workspace",
		);
	}
	return { direction: options.split, besidePaneId: besidePane.id };
}

export function placeTerminal(
	client: HostServiceClient,
	workspaceId: string,
	terminalId: string,
	placement: SplitPlacement,
) {
	return client.panes.split.mutate({
		workspaceId,
		paneId: placement.besidePaneId,
		direction: placement.direction,
		terminalId,
	});
}

/**
 * Closes every pane that `match` picks and returns their IDs. Closing panes is
 * clean-up, so a host with no desktop app or no `panes` router closes nothing.
 */
export async function closePanes(
	client: HostServiceClient,
	workspaceId: string,
	match: PaneMatch,
): Promise<string[]> {
	const panes = await listPanes(client, workspaceId).catch(() => []);
	const closed: string[] = [];
	for (const pane of panes.filter(match)) {
		await client.panes.close.mutate({
			workspaceId,
			paneId: pane.id,
			keepTerminal: true,
		});
		closed.push(pane.id);
	}
	return closed;
}
