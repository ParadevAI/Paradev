import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/** Puts `data-window-focused` on <html> from the OS window's focus, which a `<webview>` taking focus does not change. */
export function WindowFocusSync() {
	electronTrpc.window.onFocusChange.useSubscription(undefined, {
		onData: (isFocused) => {
			document.documentElement.dataset.windowFocused = String(isFocused);
		},
	});

	useEffect(
		() => () => {
			delete document.documentElement.dataset.windowFocused;
		},
		[],
	);

	return null;
}
