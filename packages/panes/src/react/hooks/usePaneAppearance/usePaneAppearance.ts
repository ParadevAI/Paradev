import { createContext, useContext } from "react";
import type { PaneAppearance } from "../../types";

export const PaneAppearanceContext = createContext<PaneAppearance>("default");

export function usePaneAppearance(): PaneAppearance {
	return useContext(PaneAppearanceContext);
}

export const PaneJoinsLeftContext = createContext(false);

export function usePaneJoinsLeft(): boolean {
	return useContext(PaneJoinsLeftContext);
}
