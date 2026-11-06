import { HTML_PREVIEW_CSP } from "@superset/shared/html-preview";

/** Scripts run; the page stays out of the app, with no popups, forms or top navigation. */
export const PREVIEW_SANDBOX = "allow-scripts";

export const PREVIEW_SIZE_MESSAGE = "chat-html-preview:size";
export const PREVIEW_ESCAPE_MESSAGE = "chat-html-preview:escape";
export const PREVIEW_MIN_HEIGHT = 80;
export const PREVIEW_MAX_HEIGHT = 480;
const MAX_REPORTED_WIDTH = 10_000;
const MAX_REPORTED_HEIGHT = 20_000;

/**
 * The root's own box is the page's height; scrollHeight would never be less
 * than the frame, so a frame sized from it could only grow. Width is only
 * reported when the page overflows its frame; 0 means it fits.
 */
const SIZE_SCRIPT = `(()=>{const post=()=>{const html=document.documentElement;const box=html.getBoundingClientRect();parent.postMessage({type:"${PREVIEW_SIZE_MESSAGE}",width:html.scrollWidth>innerWidth?html.scrollWidth:0,height:Math.max(box.height,html.scrollHeight>innerHeight?html.scrollHeight:0)},"*")};let frame=0;const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;post()})};if(typeof ResizeObserver==="function"){const observer=new ResizeObserver(schedule);observer.observe(document.documentElement);if(document.body)observer.observe(document.body)}addEventListener("load",schedule);addEventListener("keydown",e=>{if(e.key==="Escape")parent.postMessage({type:"${PREVIEW_ESCAPE_MESSAGE}"},"*")});schedule()})();`;

/**
 * The policy comes first, so it covers everything the fence wrote, and a
 * fence that is a whole document still parses: the parser merges a second
 * html, head or body tag into the first. The page reports its size so the
 * frame can take its height, and forwards Escape, which the parent window
 * never sees while the page has focus.
 */
export function previewDocument(html: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}"></head><body>${html}<script>${SIZE_SCRIPT}</script></body></html>`;
}

/** `width` is 0 when the page fits its frame sideways. */
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
		width: clamp(Math.ceil(width), 0, MAX_REPORTED_WIDTH),
		height: clamp(Math.ceil(height), 1, MAX_REPORTED_HEIGHT),
	};
}

/** The page's own Escape, forwarded because the parent window never sees it. */
export function isPreviewEscape(data: unknown): boolean {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as Record<string, unknown>).type === PREVIEW_ESCAPE_MESSAGE
	);
}
