import { useEffect } from "react";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import { isWindowTooNarrowForSidebar } from "../../utils/isWindowTooNarrowForSidebar";

/**
 * Folds the sidebar to its rail when the window gets too narrow for it, and
 * unfolds it on the way back. Acts only on crossings, so a sidebar the user
 * opens or closes by hand stays that way.
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
