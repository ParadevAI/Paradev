type MouseEventSource = Pick<Electron.WebContents, "on" | "off">;

/**
 * Calls `onPress` for each mousedown the guest receives, subframes included.
 * Electron emits `before-mouse-event` from the input pipeline, so the page
 * cannot change or block it.
 */
export function watchGuestMouseDown(
	wc: MouseEventSource,
	onPress: () => void,
): () => void {
	const listener = (
		_event: Electron.Event,
		mouse: Electron.MouseInputEvent,
	) => {
		if (mouse.type === "mouseDown") onPress();
	};
	wc.on("before-mouse-event", listener);
	return () => {
		wc.off("before-mouse-event", listener);
	};
}
