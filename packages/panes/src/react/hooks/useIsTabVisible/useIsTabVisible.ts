import { createContext, useContext } from "react";

export const TabVisibilityContext = createContext(true);

/**
 * False while the pane's tab is kept mounted but hidden (see
 * `PaneDefinition.keepAlive`). Pause polling and other background work then.
 */
export function useIsTabVisible(): boolean {
	return useContext(TabVisibilityContext);
}
