import { useCallback, useEffect, useRef, useState } from "react";
import type { SidebarSlideMode } from "../../../../components/SidebarSlide";

interface FullScreenState {
	workspaceId: string;
	closeOnExit: boolean;
}

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
	const [fullScreen, setFullScreen] = useState<FullScreenState | null>(null);
	const isFullScreen = fullScreen?.workspaceId === workspaceId;

	// Clear only when the pane goes from open to closed: entering from closed
	// sets the state before the open flag arrives, and must survive that gap.
	const wasOpenRef = useRef(isOpen);
	useEffect(() => {
		const wasOpen = wasOpenRef.current;
		wasOpenRef.current = isOpen;
		if (wasOpen && !isOpen) {
			setFullScreen((current) =>
				current?.workspaceId === workspaceId ? null : current,
			);
		}
	}, [isOpen, workspaceId]);

	const toggleFullScreen = useCallback(() => {
		if (isFullScreen && isOpen) {
			if (fullScreen?.closeOnExit) setOpen(false);
			else setFullScreen(null);
			return;
		}
		setFullScreen({ workspaceId, closeOnExit: !isOpen });
		if (!isOpen) setOpen(true);
	}, [isFullScreen, isOpen, fullScreen, workspaceId, setOpen]);

	const mode: SidebarSlideMode = !isOpen
		? "closed"
		: canExpand && isFullScreen
			? "expanded"
			: "open";

	return { mode, toggleFullScreen };
}
