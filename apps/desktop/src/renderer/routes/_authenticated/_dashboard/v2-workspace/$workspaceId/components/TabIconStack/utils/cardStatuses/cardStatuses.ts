import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";

/**
 * One status per card. Panes past the last card have no card of their own,
 * so their status rides on the last one rather than disappearing.
 */
export function cardStatuses<TPane>(
	panes: TPane[],
	cardCount: number,
	statusOf: (pane: TPane) => PaneStatus | undefined,
): (ActivePaneStatus | null)[] {
	const shown = panes.slice(0, cardCount);
	return shown.map((pane, index) => {
		const isLast = index === shown.length - 1;
		const folded = isLast ? panes.slice(cardCount) : [];
		return getHighestPriorityStatus([pane, ...folded].map(statusOf));
	});
}
