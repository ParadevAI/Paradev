import { useRef } from "react";
import { useFrameStackStore } from "renderer/commandPalette";

/**
 * Click handlers for a button that toggles the command palette. The palette
 * dismisses on an outside pointerdown before the click fires, so the open
 * state is read at pointerdown; reading it at click would always reopen it.
 */
export function useCommandPaletteToggle() {
	const setOpen = useFrameStackStore((state) => state.setOpen);
	const wasOpenRef = useRef(false);
	return {
		onPointerDown: () => {
			wasOpenRef.current = useFrameStackStore.getState().open;
		},
		onClick: () => {
			setOpen(!wasOpenRef.current);
			wasOpenRef.current = false;
		},
	};
}
