import type { WorkspaceStore } from "@superset/panes";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
import type { StoreApi } from "zustand/vanilla";
import type { PaneArea } from "../../components/WorkspaceSplitLayout";
import type { PaneViewerData } from "../../types";
import { cycleActiveTab } from "../../utils/cycleActiveTab";

type Store = StoreApi<WorkspaceStore<PaneViewerData>>;

const MAX_FRAMES_TO_WAIT_FOR_SIDEBAR = 30;

function focusActivePane(store: Store): void {
	const state = store.getState();
	const paneId = state.getActiveTab()?.activePaneId;
	if (paneId) state.focusPane(paneId);
}

function isSidebarInteractive(): boolean {
	const area = document.querySelector('[data-pane-area="right"]');
	return area !== null && area.closest("[inert]") === null;
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

	const pendingFrameRef = useRef<number | null>(null);
	const cancelPendingFocus = useCallback(() => {
		if (pendingFrameRef.current !== null) {
			cancelAnimationFrame(pendingFrameRef.current);
			pendingFrameRef.current = null;
		}
	}, []);
	const focusSidebarWhenInteractive = useCallback(() => {
		cancelPendingFocus();
		let frames = 0;
		const attempt = () => {
			pendingFrameRef.current = null;
			if (isSidebarInteractive()) {
				focusActivePane(rightStore);
				return;
			}
			if (++frames < MAX_FRAMES_TO_WAIT_FOR_SIDEBAR) {
				pendingFrameRef.current = requestAnimationFrame(attempt);
			}
		};
		attempt();
	}, [rightStore, cancelPendingFocus]);
	useEffect(() => cancelPendingFocus, [cancelPendingFocus]);

	const wasOpenRef = useRef(isOpen);
	useEffect(() => {
		const justClosed = wasOpenRef.current && !isOpen;
		wasOpenRef.current = isOpen;
		if (!enabled || !justClosed || activeAreaRef.current !== "right") return;
		cancelPendingFocus();
		focusActivePane(centerStore);
	}, [enabled, isOpen, activeAreaRef, centerStore, cancelPendingFocus]);

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
				focusSidebarWhenInteractive();
			} else if (!isExpanded) {
				focusActivePane(centerStore);
			}
		},
		{ enabled },
	);
}
