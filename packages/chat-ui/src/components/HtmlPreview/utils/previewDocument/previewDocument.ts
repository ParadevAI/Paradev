import { HTML_PREVIEW_CSP } from "@superset/shared/html-preview";

/** Scripts run; the page stays out of the app, with no popups, forms or top navigation. */
export const PREVIEW_SANDBOX = "allow-scripts";

export const PREVIEW_SIZE_MESSAGE = "chat-html-preview:size";
export const PREVIEW_MIN_HEIGHT = 80;
export const PREVIEW_MAX_HEIGHT = 480;
const MAX_REPORTED_WIDTH = 10_000;
const MAX_REPORTED_HEIGHT = 20_000;

const SIZE_SCRIPT = `(()=>{const post=()=>parent.postMessage({type:"${PREVIEW_SIZE_MESSAGE}",width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},"*");let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;post()})};if(typeof ResizeObserver==="function"){const observer=new ResizeObserver(schedule);observer.observe(document.documentElement);if(document.body)observer.observe(document.body)}addEventListener("load",schedule);schedule()})();`;

/**
 * The policy comes first, so it covers everything the fence wrote, and a
 * fence that is a whole document still parses: the parser merges a second
 * html, head or body tag into the first. The page reports its size so the
 * frame can take its height.
 */
export function previewDocument(html: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}"></head><body>${html}<script>${SIZE_SCRIPT}</script></body></html>`;
}

export type PreviewSize = { width: number; height: number };

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/** The page's own size report; anything else a page posts is ignored. */
export function readPreviewSize(data: unknown): PreviewSize | null {
	if (typeof data !== "object" || data === null) return null;
	const { type, width, height } = data as Record<string, unknown>;
	if (
		type !== PREVIEW_SIZE_MESSAGE ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	) {
		return null;
	}
	return {
		width: clamp(Math.ceil(width), 1, MAX_REPORTED_WIDTH),
		height: clamp(Math.ceil(height), 1, MAX_REPORTED_HEIGHT),
	};
}
