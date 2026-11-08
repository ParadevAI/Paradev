import type { WorkspaceState } from "@superset/panes";
import type { PersistableBrowserState } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import type {
	BrowserPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	getV2PaneLayoutStore,
	type PaneLayoutSlot,
} from "renderer/stores/v2-pane-layout-stores";

const SLOTS: PaneLayoutSlot[] = ["paneLayout", "rightPaneLayout"];

/**
 * Persists a page a background browser pane navigated to, into the
 * workspace's mounted layout when it is shown, else into its saved layout.
 */
export function persistBrowserPaneState(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	paneId: string,
): (state: PersistableBrowserState) => void {
	return (state) => {
		for (const slot of SLOTS) {
			const store = getV2PaneLayoutStore(workspaceId, slot);
			const pane = store?.getState().tabs.find((tab) => tab.panes[paneId])
				?.panes[paneId];
			if (store && pane?.kind === "browser") {
				store.getState().setPaneData({
					paneId,
					data: { ...(pane.data as BrowserPaneData), ...state },
				});
				return;
			}
		}
		if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			for (const slot of SLOTS) {
				const layout = draft[slot] as
					| WorkspaceState<PaneViewerData>
					| undefined;
				for (const tab of layout?.tabs ?? []) {
					const pane = tab.panes[paneId];
					if (pane?.kind === "browser")
						pane.data = { ...(pane.data as BrowserPaneData), ...state };
				}
			}
		});
	};
}
