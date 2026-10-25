import { useIsTabVisible } from "@superset/panes";
import { useRef } from "react";

/** `value` while the tab is shown; the last shown value while it is hidden. */
export function useHeldWhileTabHidden<T>(value: T): T {
	const isTabVisible = useIsTabVisible();
	const held = useRef(value);
	if (isTabVisible) held.current = value;
	return held.current;
}
