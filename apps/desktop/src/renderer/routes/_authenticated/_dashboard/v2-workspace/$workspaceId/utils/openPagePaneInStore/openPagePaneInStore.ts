import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PagePaneData, PaneViewerData } from "../../types";

export function openPagePaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	page: PagePaneData,
	placement: "split" | "tab" = "split",
): void {
	const pane = { kind: "page", data: page };
	if (placement === "tab") store.getState().addTab({ panes: [pane] });
	else store.getState().openPane({ pane });
}
