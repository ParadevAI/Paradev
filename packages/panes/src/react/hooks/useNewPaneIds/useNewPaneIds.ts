import { useRef } from "react";

/** The ids in `paneIds` that `seen` does not have; none when `seen` is null, the first look. */
export function newPaneIds(
	paneIds: readonly string[],
	seen: ReadonlySet<string> | null,
): ReadonlySet<string> {
	const added = new Set<string>();
	if (seen === null) return added;
	for (const id of paneIds) if (!seen.has(id)) added.add(id);
	return added;
}

export interface SeenPanes {
	tabId: string;
	ids: ReadonlySet<string>;
}

/** `newPaneIds` for one tab: a different tab than `seen` was showing is a first look. */
export function newPaneIdsInTab(
	tabId: string,
	paneIds: readonly string[],
	seen: SeenPanes | null,
): ReadonlySet<string> {
	return newPaneIds(paneIds, seen?.tabId === tabId ? seen.ids : null);
}

/**
 * Which of `paneIds` joined `tabId` since the last render of that same tab.
 * The first look at a tab reports none, so a restored layout, a fresh tab
 * and a switch to another tab all appear at once; only a pane added to the
 * tab already on screen counts as new.
 */
export function useNewPaneIds(
	tabId: string,
	paneIds: readonly string[],
): ReadonlySet<string> {
	const seenRef = useRef<SeenPanes | null>(null);
	const added = newPaneIdsInTab(tabId, paneIds, seenRef.current);
	seenRef.current = { tabId, ids: new Set(paneIds) };
	return added;
}
