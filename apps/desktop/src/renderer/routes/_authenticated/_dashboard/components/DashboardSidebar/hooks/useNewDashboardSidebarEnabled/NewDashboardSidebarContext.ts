import { createContext, useContext } from "react";

/**
 * The sidebar decides once whether the new sidebar is on and hands it down,
 * so each row reads a context instead of subscribing to the flags itself.
 */
export const NewDashboardSidebarContext = createContext(false);

export function useIsNewDashboardSidebar(): boolean {
	return useContext(NewDashboardSidebarContext);
}
