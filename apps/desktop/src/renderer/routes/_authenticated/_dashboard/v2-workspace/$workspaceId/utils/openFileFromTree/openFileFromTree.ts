import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { FilePaneData, PaneViewerData } from "../../types";

export function openFileFromTree({
	store,
	filePath,
	sourcePaneId,
	pin = false,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	filePath: string;
	sourcePaneId?: string;
	pin?: boolean;
}): void {
	const state = store.getState();
	const show = (paneId: string) => {
		if (!pin) {
			const location = state.getPane(paneId);
			if (location) state.setActivePane({ tabId: location.tabId, paneId });
			return;
		}
		state.setPanePinned({ paneId, pinned: true });
		state.focusPane(paneId);
	};

	const filePanes = state.tabs.flatMap((tab) =>
		Object.values(tab.panes).filter((pane) => pane.kind === "file"),
	);
	const open = filePanes.find(
		(pane) => (pane.data as FilePaneData).filePath === filePath,
	);
	if (open) {
		state.setPanePinned({ paneId: open.id, pinned: true });
		state.focusPane(open.id);
		return;
	}

	const data: FilePaneData = { filePath, mode: "editor" };
	const newPane = {
		id: crypto.randomUUID(),
		kind: "file",
		pinned: pin || undefined,
		data,
	};
	const source = sourcePaneId ? state.getPane(sourcePaneId) : null;
	const sourceTab = source ? state.getTab(source.tabId) : null;
	if (
		source?.pane.kind === "files" &&
		Object.keys(sourceTab?.panes ?? {}).length === 1
	) {
		state.replacePane({
			tabId: source.tabId,
			paneId: source.pane.id,
			newPane,
		});
		if (pin) state.focusPane(newPane.id);
		return;
	}

	const preview = pin ? undefined : filePanes.find((pane) => !pane.pinned);
	if (preview) {
		state.setPaneData({ paneId: preview.id, data });
		show(preview.id);
		return;
	}
	state.addTab({ panes: [newPane], focus: pin });
}
