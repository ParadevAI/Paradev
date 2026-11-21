import {
	applyPageViewportZoom,
	NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT,
	type PageViewportZoom,
} from "@superset/shared/page-zoom";

function isPageViewportZoom(value: unknown): value is PageViewportZoom {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return ["scale", "x", "y", "width", "height"].every(
		(key) => typeof v[key] === "number",
	);
}

type ViewportZoomWebview = Pick<
	Electron.WebviewTag,
	"addEventListener" | "removeEventListener" | "executeJavaScript"
> &
	Parameters<typeof applyPageViewportZoom>[0];

export function attachBrowserViewportZoom(webview: ViewportZoomWebview) {
	let generation = 0;
	const onReady = () => {
		const current = ++generation;
		const listen = async () => {
			while (generation === current) {
				let viewport: unknown;
				try {
					viewport = await webview.executeJavaScript(
						NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT,
					);
				} catch {
					return;
				}
				if (generation !== current) return;
				// A page that replaces `Promise` (Zone.js) makes executeJavaScript
				// return at once with a non-viewport value; looping on it never waits.
				if (!isPageViewportZoom(viewport)) return;
				applyPageViewportZoom(webview, viewport);
			}
		};
		void listen();
	};
	webview.addEventListener("dom-ready", onReady);
	return () => {
		generation++;
		webview.removeEventListener("dom-ready", onReady);
	};
}
