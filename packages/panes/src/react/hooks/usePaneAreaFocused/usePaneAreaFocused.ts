import { createContext, useContext } from "react";

export const PaneAreaFocusedContext = createContext(true);

export function usePaneAreaFocused(): boolean {
	return useContext(PaneAreaFocusedContext);
}
