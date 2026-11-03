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
	const paneGiven = options.pane !== undefined && options.pane !== null;
	if (!options.split) {
		if (paneGiven) {
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
	const besidePane = paneGiven
		? panes.find((pane) => pane.id === options.pane)
		: panes.find(
				(pane) => callerTerminalId && pane.terminalId === callerTerminalId,
			);
	if (!besidePane) {
		throw new CLIError(
			paneGiven
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

export interface ClosedPanes {
	closedPaneIds: string[];
	error: string | null;
}

/**
 * Closes every pane that `match` picks. It never throws, so the caller still
 * ends the terminal or session. A host with no desktop app closes nothing.
 */
export async function closePanes(
	client: HostServiceClient,
	workspaceId: string,
	match: PaneMatch,
): Promise<ClosedPanes> {
	const closedPaneIds: string[] = [];
	let panes: PaneLayoutPane[];
	try {
		panes = await listPanes(client, workspaceId);
	} catch (error) {
		if (hasNoPanes(error)) return { closedPaneIds, error: null };
		return { closedPaneIds, error: errorMessage(error) };
	}
	try {
		for (const pane of panes.filter(match)) {
			await client.panes.close.mutate({
				workspaceId,
				paneId: pane.id,
				keepTerminal: true,
			});
			closedPaneIds.push(pane.id);
		}
		return { closedPaneIds, error: null };
	} catch (error) {
		return { closedPaneIds, error: errorMessage(error) };
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isMissingPanesRouter(error: unknown): boolean {
	return (
		error instanceof Error &&
		/No procedure found on path "?panes\./.test(error.message)
	);
}

function hasNoPanes(error: unknown): boolean {
	const code = (error as { data?: { code?: string } } | null)?.data?.code;
	return code === "PRECONDITION_FAILED" || isMissingPanesRouter(error);
}

export function paneCloseError(what: string, error: string): CLIError {
	return new CLIError(
		`Closed ${what}, but not the panes that show it: ${error}`,
		"Check with `superset panes list`, then close them with `superset panes close`",
	);
}

export function stopFailedError(
	what: string,
	panes: ClosedPanes,
	error: unknown,
): CLIError {
	const reason = errorMessage(error);
	const ids = panes.closedPaneIds;
	const closed =
		ids.length === 0
			? ""
			: ` Its ${ids.length === 1 ? "pane" : "panes"} ${ids.join(", ")} ${ids.length === 1 ? "is" : "are"} closed.`;
	const open = panes.error ? ` Some panes did not close: ${panes.error}.` : "";
	return new CLIError(
		`Could not end ${what}: ${reason}.${closed}${open}`,
		(error instanceof CLIError && error.suggestion) ||
			"Run the same command again to retry",
	);
}

export function closedPanesMessage(what: string, paneIds: string[]): string {
	if (paneIds.length === 0) return `Closed ${what}`;
	return `Closed ${what} and its ${paneIds.length === 1 ? "pane" : "panes"} ${paneIds.join(", ")}`;
}
