import { getPaneIdsInLayout, type Pane, type Tab } from "@superset/panes";

/** A tab's panes with the focused one first, then the others in layout order. */
export function orderTabPanes<TData>(tab: Tab<TData>): Pane<TData>[] {
	const ids = getPaneIdsInLayout(tab.layout);
	const { activePaneId } = tab;
	const ordered =
		activePaneId && ids.includes(activePaneId)
			? [activePaneId, ...ids.filter((id) => id !== activePaneId)]
			: ids;
	return ordered.flatMap((id) => tab.panes[id] ?? []);
}
