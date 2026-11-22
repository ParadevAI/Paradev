import {
	NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT,
	type PageViewportZoom,
} from "@superset/shared/page-zoom";

/**
 * The script runs in its own world so the page's globals cannot change it. In
 * the main world, a page that replaces `Promise` (Zone.js) made
 * `executeJavaScript` return at once, and the loop never waited.
 */
export const VIEWPORT_ZOOM_WORLD_ID = 1999;

export function isPageViewportZoom(value: unknown): value is PageViewportZoom {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return ["scale", "x", "y", "width", "height"].every(
		(key) => typeof v[key] === "number",
	);
}

export interface ViewportZoomForwardDeps {
	runScript: (script: string) => Promise<unknown>;
	onViewport: (viewport: PageViewportZoom) => void;
}

/** `rearm` starts a loop for the current document and stops the previous one. */
export function createViewportZoomForward(deps: ViewportZoomForwardDeps) {
	let generation = 0;
	const rearm = () => {
		const current = ++generation;
		void (async () => {
			while (generation === current) {
				let viewport: unknown;
				try {
					viewport = await deps.runScript(NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT);
				} catch {
					return;
				}
				if (generation !== current || !isPageViewportZoom(viewport)) return;
				deps.onViewport(viewport);
			}
		})();
	};
	return {
		rearm,
		cancel: () => {
			generation++;
		},
	};
}
