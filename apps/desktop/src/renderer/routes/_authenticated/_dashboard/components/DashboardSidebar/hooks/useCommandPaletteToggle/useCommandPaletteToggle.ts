import { type MouseEvent, useRef } from "react";
import { useFrameStackStore } from "renderer/commandPalette";

/**
 * Click handlers for a button that toggles the command palette. The palette
 * dismisses on an outside pointerdown before the click fires, so a pointer
 * click uses the open state read at pointerdown; a keyboard click (detail 0)
 * has no pointerdown and reads the live state.
 */
export function useCommandPaletteToggle() {
	const setOpen = useFrameStackStore((state) => state.setOpen);
	const wasOpenRef = useRef(false);
	return {
		onPointerDown: () => {
			wasOpenRef.current = useFrameStackStore.getState().open;
		},
		onClick: (event: MouseEvent) => {
			const wasOpen =
				event.detail > 0
					? wasOpenRef.current
					: useFrameStackStore.getState().open;
			setOpen(!wasOpen);
			wasOpenRef.current = false;
		},
	};
}
