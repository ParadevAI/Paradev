import type {
	CreatePaneInput,
	RendererContext,
	WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneTarget, PaneViewerData } from "../../../../types";

/** Opens a viewer pane where viewers live: beside this pane, or in the right area. */
export function splitWithViewer(
	ctx: {
		store: StoreApi<WorkspaceStore<PaneViewerData>>;
		actions: Pick<RendererContext<PaneViewerData>["actions"], "split">;
	},
	viewer: PaneTarget,
	pane: CreatePaneInput<PaneViewerData>,
): void {
	if (viewer.store === ctx.store) {
		ctx.actions.split("right", pane);
		return;
	}
	viewer.reveal();
	viewer.store.getState().openPane({ pane });
}
