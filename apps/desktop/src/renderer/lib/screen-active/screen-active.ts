import { createContext, useContext } from "react";

/** False inside a workspace that stays mounted but hidden. Global effects
 *  (hotkeys, title bar slots, menu events, global listeners) must stay off. */
export const ScreenActiveContext = createContext(true);

export function useIsScreenActive(): boolean {
	return useContext(ScreenActiveContext);
}

/** False inside a workspace mounted ahead of time that the user has not
 *  opened yet. Panes that start shells, agents or pages wait for it. */
export const ScreenShownContext = createContext(true);

export function useHasScreenBeenShown(): boolean {
	return useContext(ScreenShownContext);
}
