import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import {
	callPanes,
	directionOption,
	layoutResult,
	requireSidebar,
	workspaceOptions,
} from "../shared";

const PLACEMENT = {
	right: "right of",
	left: "left of",
	down: "below",
	up: "above",
} as const;

export default command({
	description:
		"Move a pane next to another pane (--to and --direction), into a new tab (--new-tab), or into a new tab in the right sidebar or main area (--sidebar, --main)",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane to move"),
		to: string().desc("Pane to place it next to"),
		direction: directionOption(),
		newTab: boolean().desc("Move the pane into a new tab of its own"),
		sidebar: boolean().desc(
			"Move the pane into a new tab in the right sidebar",
		),
		main: boolean().desc("Move the pane into a new tab in the main area"),
	},
	run: async ({ ctx, options }) => {
		const workspaceId = options.workspace;
		const paneId = options.pane;
		const targets = [options.newTab, options.sidebar, options.main].filter(
			Boolean,
		).length;
		if (targets > 1) {
			throw new CLIError("Pass only one of --new-tab, --sidebar, and --main");
		}
		if (targets === 1) {
			if (options.to || options.direction) {
				throw new CLIError(
					"--new-tab, --sidebar, and --main cannot be used with --to or --direction",
				);
			}
			const area = options.sidebar
				? ("sidebar" as const)
				: options.main
					? ("main" as const)
					: undefined;
			const client = await resolveHostClient(ctx, options);
			const result = await callPanes(() =>
				client.panes.moveToNewTab.mutate({
					workspaceId,
					paneId,
					...(area ? { area } : {}),
				}),
			);
			if (area) {
				requireSidebar(
					result.layout,
					`${paneId} moved to new tab ${result.tabId} in its own area`,
				);
			}
			const where = area === "sidebar" ? " in the sidebar" : "";
			return layoutResult(
				`Moved ${paneId} to new tab ${result.tabId}${where}`,
				result,
			);
		}

		const { to, direction } = options;
		if (!to || !direction) {
			throw new CLIError(
				"Say where to move the pane",
				"Pass --to PANE --direction right|left|down|up, or --new-tab, --sidebar, or --main",
			);
		}
		const client = await resolveHostClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.move.mutate({
				workspaceId,
				paneId,
				targetPaneId: to,
				direction,
			}),
		);
		return layoutResult(
			`Moved ${paneId} ${PLACEMENT[direction]} ${to}`,
			result,
		);
	},
});
