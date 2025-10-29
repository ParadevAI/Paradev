import type { Tab } from "shared/types";

/**
 * Helper functions for working with tabs
 */

/**
 * Find a tab by ID recursively in a tab tree
 */
export function findTab(tabs: Tab[], tabId: string): Tab | null {
	for (const tab of tabs) {
		if (tab.id === tabId) {
			return tab;
		}
		if (tab.type === "group" && tab.tabs) {
			const found = findTab(tab.tabs, tabId);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Find the parent tab of a given tab ID
 */
export function findParentTab(tabs: Tab[], tabId: string): Tab | null {
	for (const tab of tabs) {
		if (tab.type === "group" && tab.tabs) {
			if (tab.tabs.some((t) => t.id === tabId)) {
				return tab;
			}
			const found = findParentTab(tab.tabs, tabId);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Recalculate grid positions for tabs in a group
 */
export function recalculateTabPositions(tabs: Tab[], cols: number): Tab[] {
	return tabs.map((tab, index) => {
		const row = Math.floor(index / cols);
		const col = index % cols;
		return { ...tab, order: index, row, col };
	});
}

/**
 * Remove a tab from a tab tree recursively
 * Returns true if the tab was found and removed
 */
export function removeTabRecursive(tabs: Tab[], tabId: string): boolean {
	const tabIndex = tabs.findIndex((t) => t.id === tabId);
	if (tabIndex !== -1) {
		tabs.splice(tabIndex, 1);
		return true;
	}

	// Search in nested tabs
	for (const tab of tabs) {
		if (tab.type === "group" && tab.tabs) {
			if (removeTabRecursive(tab.tabs, tabId)) {
				// Recalculate grid positions for remaining tabs
				if (tab.cols) {
					tab.tabs = recalculateTabPositions(tab.tabs, tab.cols);
				}
				return true;
			}
		}
	}
	return false;
}

/**
 * Validate that a tab can be a parent (must be a group type)
 */
export function isValidParentTab(tab: Tab | null): boolean {
	return tab !== null && tab.type === "group";
}
