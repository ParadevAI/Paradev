import { createContext, useContext } from "react";
import type { PaneAppearance } from "../../types";

export const PaneAppearanceContext = createContext<PaneAppearance>("default");

export function usePaneAppearance(): PaneAppearance {
	return useContext(PaneAppearanceContext);
}

export const PaneFlushContext = createContext(false);

export function usePaneFlush(): boolean {
	return useContext(PaneFlushContext);
}
