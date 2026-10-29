import type { WorkspaceStore } from "@superset/panes";
import { useCallback } from "react";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	DiffFocusSide,
	DiffPaneData,
	PagePaneData,
	PaneTarget,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { openPagePaneInStore } from "../../utils/openPagePaneInStore";
import { openPullRequestPaneInStore } from "../../utils/openPullRequestPaneInStore";
import { useDefaultBrowserUrl } from "../useDefaultBrowserUrl";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useWorkspacePaneOpeners({
	store,
	viewer,
	launcher,
	newTabPresets,
	executePreset,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	viewer: PaneTarget;
	launcher: TerminalLauncher;
	newTabPresets: V2TerminalPresetRow[];
	executePreset: (
		preset: V2TerminalPresetRow,
		options?: { target?: "new-tab" | "active-tab" },
	) => void | Promise<void>;
}): {
	openDiffPane: (
		filePath: string,
		openInNewTab?: boolean,
		line?: number,
		side?: DiffFocusSide,
		changeKey?: string,
	) => void;
	addTerminalTab: () => Promise<void>;
	addBrowserTab: () => void;
	openPagePane: (page: PagePaneData, placement: "split" | "tab") => void;
	/** Focus or open the pane showing the workspace's linked PR summary. */
	openPullRequestPane: OpenPullRequestPane;
} {
	const openDiffPane = useCallback(
		(
			filePath: string,
			openInNewTab?: boolean,
			line?: number,
			side?: DiffFocusSide,
			changeKey?: string,
		) => {
			viewer.reveal();
			const state = viewer.store.getState();
			// Bump the tick on every request so repeat clicks re-scroll and a
			// navigation into an unmounted pane wins over its older cached position.
			const focusFields = {
				focusLine: line,
				focusSide: line != null ? side : undefined,
				focusTick: Date.now(),
			};
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path: filePath,
								changeKey,
								collapsedFiles: [],
								...focusFields,
							} as DiffPaneData,
						},
					],
				});
				return;
			}
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "diff") continue;
					const prev = pane.data as DiffPaneData;
					state.setPaneData({
						paneId: pane.id,
						data: {
							...prev,
							path: filePath,
							changeKey,
							// Only the navigated file's key can be pruned; without a
							// change key we can't identify it, so leave the set intact.
							collapsedFiles: changeKey
								? (prev.collapsedFiles ?? []).filter((key) => key !== changeKey)
								: (prev.collapsedFiles ?? []),
							...focusFields,
						} as PaneViewerData,
					});
					state.focusPane(pane.id);
					return;
				}
			}
			state.openPane({
				pane: {
					kind: "diff",
					data: {
						path: filePath,
						changeKey,
						collapsedFiles: [],
						...focusFields,
					} as DiffPaneData,
				},
			});
		},
		[viewer],
	);

	const addBlankTerminalTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: {
						terminalId: launcher.mint(),
						createOnAttach: true,
					} as TerminalPaneData,
				},
			],
		});
	}, [store, launcher]);

	const addTerminalTab = useCallback(async () => {
		if (newTabPresets.length === 0) {
			addBlankTerminalTab();
			return;
		}

		// New terminal tabs are the trigger point for applyOnNewTab presets.
		// Each matching preset owns the tab/pane shape it creates.
		for (const preset of newTabPresets) {
			await executePreset(preset, { target: "new-tab" });
		}
	}, [addBlankTerminalTab, executePreset, newTabPresets]);

	const defaultBrowserUrl = useDefaultBrowserUrl();
	const addBrowserTab = useCallback(() => {
		viewer.reveal();
		viewer.store.getState().addTab({
			panes: [
				{
					kind: "browser",
					data: {
						url: defaultBrowserUrl,
					} as BrowserPaneData,
				},
			],
		});
	}, [viewer, defaultBrowserUrl]);

	const openPagePane = useCallback(
		(page: PagePaneData, placement: "split" | "tab") => {
			viewer.reveal();
			openPagePaneInStore(viewer.store, page, placement);
		},
		[viewer],
	);

	const openPullRequestPane = useCallback<OpenPullRequestPane>(
		(ref, placement) => {
			viewer.reveal();
			openPullRequestPaneInStore(viewer.store, ref, placement);
		},
		[viewer],
	);

	return {
		openDiffPane,
		addTerminalTab,
		addBrowserTab,
		openPagePane,
		openPullRequestPane,
	};
}
