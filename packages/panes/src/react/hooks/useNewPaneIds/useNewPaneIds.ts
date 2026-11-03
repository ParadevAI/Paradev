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

/**
 * Which of `paneIds` joined since the last render. The first render reports
 * none, so a restored layout and a freshly opened tab appear at once; only a
 * pane added to a tab that is already on screen counts as new.
 */
export function useNewPaneIds(paneIds: readonly string[]): ReadonlySet<string> {
	const seenRef = useRef<Set<string> | null>(null);
	const added = newPaneIds(paneIds, seenRef.current);
	seenRef.current = new Set(paneIds);
	return added;
}
