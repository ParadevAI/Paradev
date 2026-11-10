import { createContext, useContext } from "react";
import type { PaneAppearance } from "../../types";

export const PaneAppearanceContext = createContext<PaneAppearance>("default");

export function usePaneAppearance(): PaneAppearance {
	return useContext(PaneAppearanceContext);
}
