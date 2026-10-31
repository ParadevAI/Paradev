import { useCallback, useEffect, useRef } from "react";
import { useRightPaneFullScreen } from "renderer/stores/right-pane-full-screen";
import type { SidebarSlideMode } from "../../../../components/SidebarSlide";

export function useRightPaneMode({
	workspaceId,
	isOpen,
	setOpen,
	canExpand,
}: {
	workspaceId: string;
	isOpen: boolean;
	setOpen: (open: boolean) => void;
	canExpand: boolean;
}): { mode: SidebarSlideMode; toggleFullScreen: () => void } {
	const fullScreen = useRightPaneFullScreen((state) => state.fullScreen);
	const setFullScreen = useRightPaneFullScreen((state) => state.setFullScreen);
	const clearFor = useRightPaneFullScreen((state) => state.clearFor);
	const isFullScreen = fullScreen?.workspaceId === workspaceId;

	// Clear only when the pane goes from open to closed: entering from closed
	// sets the state before the open flag arrives, and must survive that gap.
	const wasOpenRef = useRef(isOpen);
	useEffect(() => {
		const wasOpen = wasOpenRef.current;
		wasOpenRef.current = isOpen;
		if (wasOpen && !isOpen) clearFor(workspaceId);
	}, [isOpen, workspaceId, clearFor]);

	const toggleFullScreen = useCallback(() => {
		if (isFullScreen && isOpen) {
			if (fullScreen?.closeOnExit) setOpen(false);
			else setFullScreen(null);
			return;
		}
		setFullScreen({ workspaceId, closeOnExit: !isOpen });
		if (!isOpen) setOpen(true);
	}, [isFullScreen, isOpen, fullScreen, workspaceId, setOpen, setFullScreen]);

	const mode: SidebarSlideMode = !isOpen
		? "closed"
		: canExpand && isFullScreen
			? "expanded"
			: "open";

	return { mode, toggleFullScreen };
}
