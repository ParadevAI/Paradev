import {
	applyPageViewportZoom,
	type PageViewportZoom,
} from "@superset/shared/page-zoom";

interface ViewportZoomSource {
	subscribe: (
		input: { paneId: string },
		handlers: { onData: (viewport: PageViewportZoom) => void },
	) => { unsubscribe: () => void };
}

/** The main process reads the guest's pinch zoom; this applies it to the webview. */
export function attachBrowserViewportZoom(
	webview: Parameters<typeof applyPageViewportZoom>[0],
	paneId: string,
	source: ViewportZoomSource,
) {
	const subscription = source.subscribe(
		{ paneId },
		{ onData: (viewport) => applyPageViewportZoom(webview, viewport) },
	);
	return () => subscription.unsubscribe();
}
