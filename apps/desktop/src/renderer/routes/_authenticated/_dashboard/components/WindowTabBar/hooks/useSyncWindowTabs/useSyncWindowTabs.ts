import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useWindowTabsStore } from "renderer/stores/window-tabs";
import { describeWindowTab } from "../../utils/describeWindowTab";

/** The route on screen is the active tab; a route with no tab yet opens one. */
export function useSyncWindowTabs() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const href = useRouterState({ select: (state) => state.location.href });
	useEffect(() => {
		const tab = describeWindowTab(pathname);
		if (tab) useWindowTabsStore.getState().open({ ...tab, href });
	}, [pathname, href]);
}
