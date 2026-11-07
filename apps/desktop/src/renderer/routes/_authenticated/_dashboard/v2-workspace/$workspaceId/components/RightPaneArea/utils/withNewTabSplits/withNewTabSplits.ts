import type {
	ContextMenuActionConfig,
	PaneActionConfig,
} from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { NEW_TAB_PANE } from "../../../RightPaneNewTab";

export function withNewTabSplitButton(
	actions: PaneActionConfig<PaneViewerData>[],
): PaneActionConfig<PaneViewerData>[] {
	return actions.map((action) =>
		action.key === "split"
			? {
					...action,
					onClick: (ctx) =>
						ctx.actions.split(
							ctx.pane.parentDirection === "horizontal" ? "down" : "right",
							NEW_TAB_PANE,
						),
				}
			: action,
	);
}

const SPLIT_MENU_POSITIONS: Record<string, "down" | "right"> = {
	"split-horizontal": "down",
	"split-vertical": "right",
};

export function withNewTabSplitMenu(
	actions: ContextMenuActionConfig<PaneViewerData>[],
): ContextMenuActionConfig<PaneViewerData>[] {
	return actions.map((action) => {
		const position = SPLIT_MENU_POSITIONS[action.key];
		if (!position) return action;
		return {
			...action,
			onSelect: (ctx) => ctx.actions.split(position, NEW_TAB_PANE),
		};
	});
}
