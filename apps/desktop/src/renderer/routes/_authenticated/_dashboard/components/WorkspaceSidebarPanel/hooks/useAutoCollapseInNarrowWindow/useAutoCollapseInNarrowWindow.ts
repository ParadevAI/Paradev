import { useEffect } from "react";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { isWindowTooNarrowForSidebar } from "../../utils/isWindowTooNarrowForSidebar";

/**
 * Folds the sidebar to its rail when the window gets too narrow for it, and
 * unfolds it on the way back. Once the user toggles or resizes the sidebar it
 * stays where they put it for the rest of the session.
 */
export function useAutoCollapseInNarrowWindow() {
	useEffect(() => {
		let wasNarrow: boolean | null = null;
		const sync = () => {
			const store = useWorkspaceSidebarStore.getState();
			const isNarrow = isWindowTooNarrowForSidebar(
				window.innerWidth,
				store.lastExpandedWidth,
			);
			if (isNarrow === wasNarrow) return;
			wasNarrow = isNarrow;
			if (isNarrow) store.autoCollapse();
			else store.autoExpand();
		};
		sync();
		window.addEventListener("resize", sync);
		return () => window.removeEventListener("resize", sync);
	}, []);
}
