import type { WorkspaceStore } from "@superset/panes";
import { type MutableRefObject, useCallback } from "react";
import { useHotkey } from "renderer/hotkeys";
import type { StoreApi } from "zustand/vanilla";
import type { PaneArea } from "../../components/WorkspaceSplitLayout";
import type { PaneViewerData } from "../../types";
import { cycleActiveTab } from "../../utils/cycleActiveTab";

type Store = StoreApi<WorkspaceStore<PaneViewerData>>;

function focusActivePane(store: Store): void {
	const state = store.getState();
	const paneId = state.getActiveTab()?.activePaneId;
	if (paneId) state.focusPane(paneId);
}

export function useRightSidebarHotkeys({
	centerStore,
	rightStore,
	enabled,
	isOpen,
	isExpanded,
	open,
	activeAreaRef,
}: {
	centerStore: Store;
	rightStore: Store;
	enabled: boolean;
	isOpen: boolean;
	isExpanded: boolean;
	open: () => void;
	activeAreaRef: MutableRefObject<PaneArea>;
}): void {
	const isFocusInSidebar = useCallback(
		() => isOpen && activeAreaRef.current === "right",
		[isOpen, activeAreaRef],
	);

	useHotkey(
		"PREV_RIGHT_SIDEBAR_TAB",
		() => cycleActiveTab(rightStore, -1, { focus: isFocusInSidebar() }),
		{ enabled: enabled && isOpen },
	);
	useHotkey(
		"NEXT_RIGHT_SIDEBAR_TAB",
		() => cycleActiveTab(rightStore, 1, { focus: isFocusInSidebar() }),
		{ enabled: enabled && isOpen },
	);
	useHotkey(
		"TOGGLE_RIGHT_SIDEBAR_FOCUS",
		() => {
			if (!isFocusInSidebar()) {
				open();
				focusActivePane(rightStore);
			} else if (!isExpanded) {
				focusActivePane(centerStore);
			}
		},
		{ enabled },
	);
}
