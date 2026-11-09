import type { PaneArea } from "renderer/routes/_authenticated/_dashboard/providers/PaneAreaProvider";

/** A closed or disabled sidebar cannot hold focus, whatever was pressed last. */
export function focusedPaneArea({
	rightPaneAreaOpen,
	lastArea,
}: {
	rightPaneAreaOpen: boolean;
	lastArea: PaneArea;
}): PaneArea {
	return rightPaneAreaOpen && lastArea === "right" ? "right" : "center";
}
